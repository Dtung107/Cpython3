package com.example

import com.example.filemanager.extensions.GitHubApkPushManager
import com.example.filemanager.extensions.GitHubPushResult
import com.example.filemanager.extensions.GitHubTokenStorage
import com.example.filemanager.extensions.GitHubUserProfile
import com.example.filemanager.extensions.TokenValidationResult
import kotlinx.coroutines.test.runTest
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GitHubApkPushManagerTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private class InMemoryTokenStorage(
        initialToken: String = "",
        initialUser: GitHubUserProfile? = null
    ) : GitHubTokenStorage {
        private var token = initialToken
        private var user = initialUser
        private var repoName = "filemanagerpro-android"
        private var pinnedRepoName = ""
        private var singleRepoMode = true
        private var sourceDir = ""

        override fun getToken(): String = token
        override fun saveVerifiedToken(token: String, user: GitHubUserProfile) {
            val prev = this.token
            this.token = token
            this.user = user
            if (prev.isNotBlank() && prev != token) {
                this.pinnedRepoName = ""
                this.repoName = "filemanagerpro-android"
            }
        }

        override fun clearToken() {
            this.token = ""
            this.user = null
            this.pinnedRepoName = ""
            this.repoName = "filemanagerpro-android"
        }

        override fun getUser(): GitHubUserProfile? = user
        override fun getRepoName(): String = repoName
        override fun saveRepoName(name: String) {
            repoName = name
        }

        override fun getPinnedRepoName(): String = pinnedRepoName
        override fun savePinnedRepoName(name: String) {
            pinnedRepoName = name
        }

        override fun isSingleDefaultRepoMode(): Boolean = singleRepoMode
        override fun setSingleDefaultRepoMode(enabled: Boolean) {
            singleRepoMode = enabled
        }

        override fun getSourceDirPath(): String = sourceDir
        override fun saveSourceDirPath(path: String) {
            sourceDir = path
        }
    }

    private fun fakeClient(handler: (okhttp3.Request) -> Pair<Int, String>): OkHttpClient {
        val interceptor = Interceptor { chain ->
            val req = chain.request()
            val (code, json) = handler(req)
            Response.Builder()
                .request(req)
                .protocol(Protocol.HTTP_1_1)
                .code(code)
                .message(if (code == 401) "Unauthorized" else "OK")
                .header("X-OAuth-Scopes", "repo, workflow")
                .body(json.toResponseBody("application/json; charset=utf-8".toMediaType()))
                .build()
        }
        return OkHttpClient.Builder().addInterceptor(interceptor).build()
    }

    @Test
    fun sanitizeToken_stripsZeroWidthQuotesWhitespaceAndPrefixes() {
        val dirty = "  \"Authorization: Bearer \u200B\uFEFFtoken ghp_abc123XYZ\n\t\u2060'  "
        assertEquals("ghp_abc123XYZ", GitHubApkPushManager.sanitizeToken(dirty))
    }

    @Test
    fun redactToken_hidesTokenPatternsAndExplicitSecret() {
        val secret = "ghp_MySuperSecretToken99999"
        val rawErr = "Failed request with Authorization: Bearer $secret on https://api.github.com"
        val redacted = GitHubApkPushManager.redactToken(rawErr, secret)
        assertFalse(redacted.contains(secret))
        assertTrue(redacted.contains("[REDACTED_TOKEN]"))
    }

    @Test
    fun validateAndSaveToken_doesNotSaveOn401AndClearsExistingStaleToken() = runTest {
        val staleUser = GitHubUserProfile(login = "olduser", name = "Old User", avatarUrl = "")
        val storage = InMemoryTokenStorage(initialToken = "ghp_old_expired_token", initialUser = staleUser)

        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient { 401 to """{"message":"Bad credentials"}""" }
        )

        val result = manager.validateAndSaveToken("ghp_invalid_or_expired_123456")

        assertTrue(result is TokenValidationResult.InvalidOrExpired)
        assertTrue((result as TokenValidationResult.InvalidOrExpired).wasClearedFromStorage)
        // Must NEVER save bad token and MUST wipe previous stale token on 401
        assertEquals("", storage.getToken())
        assertNull(storage.getUser())
        assertEquals("", manager.state.value.verifiedToken)
        assertNull(manager.state.value.verifiedUser)
        assertTrue(manager.state.value.validationIsError)
    }

    @Test
    fun validateAndSaveToken_savesOnlyAfterHttp200Verification() = runTest {
        val storage = InMemoryTokenStorage()
        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient {
                200 to """{"login":"dev-android","name":"Dev Android","avatar_url":"https://example.com/a.png"}"""
            }
        )

        val result = manager.validateAndSaveToken("Bearer ghp_validtoken_987654\u200B")

        assertTrue(result is TokenValidationResult.Valid)
        assertEquals("ghp_validtoken_987654", storage.getToken())
        assertEquals("dev-android", storage.getUser()?.login)
        assertTrue(storage.getUser()?.hasWorkflowScope == true)
    }

    @Test
    fun pushSourceAndBuildApk_autoCreatesRepoAddsWorkflowAndUpdatesBranch() = runTest {
        val projectDir = tempFolder.newFolder("SampleAndroidApp")
        projectDir.resolve("build.gradle.kts").writeText("// root gradle\n")
        val appDir = projectDir.resolve("app").apply { mkdirs() }
        appDir.resolve("Main.kt").writeText("fun main() {}\n")

        val seenPaths = mutableListOf<String>()
        var uploadedTreeContent = ""

        val storage = InMemoryTokenStorage()
        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient { req ->
                val path = req.url.encodedPath
                seenPaths.add("${req.method} $path")
                when {
                    req.method == "GET" && path == "/user" ->
                        200 to """{"login":"builder","name":"Builder","avatar_url":""}"""
                    req.method == "GET" && path == "/repos/builder/my-apk-app" ->
                        404 to """{"message":"Not Found"}"""
                    req.method == "POST" && path == "/user/repos" ->
                        201 to """{"name":"my-apk-app","default_branch":"main"}"""
                    req.method == "GET" && path == "/repos/builder/my-apk-app/git/ref/heads/main" ->
                        200 to """{"object":{"sha":"basecommitsha111"}}"""
                    req.method == "POST" && path == "/repos/builder/my-apk-app/git/blobs" ->
                        201 to """{"sha":"blobsha_${seenPaths.size}"}"""
                    req.method == "POST" && path == "/repos/builder/my-apk-app/git/trees" -> {
                        val buffer = okio.Buffer()
                        req.body?.writeTo(buffer)
                        uploadedTreeContent = buffer.readUtf8()
                        201 to """{"sha":"treesha_999"}"""
                    }
                    req.method == "POST" && path == "/repos/builder/my-apk-app/git/commits" ->
                        201 to """{"sha":"commitsha_888"}"""
                    req.method == "PATCH" && path == "/repos/builder/my-apk-app/git/refs/heads/main" ->
                        200 to """{"ref":"refs/heads/main"}"""
                    req.method == "POST" && path == "/repos/builder/my-apk-app/actions/workflows/android.yml/dispatches" ->
                        204 to ""
                    req.method == "GET" && path == "/repos/builder/my-apk-app/actions/runs" ->
                        200 to """{"total_count":1,"workflow_runs":[{"id":42,"status":"queued","html_url":"https://github.com/builder/my-apk-app/actions/runs/42"}]}"""
                    else -> 404 to """{"message":"Unhandled route $path"}"""
                }
            }
        )

        val pushResult = manager.pushSourceAndBuildApk(
            rawToken = "ghp_good_token_123456",
            sourceDir = projectDir,
            rawRepoName = "my-apk-app"
        )

        assertTrue(pushResult is GitHubPushResult.Success)
        val success = pushResult as GitHubPushResult.Success
        assertEquals("builder/my-apk-app", success.repoFullName)
        assertEquals("https://github.com/builder/my-apk-app/actions/runs/42", success.actionsUrl)
        assertEquals(3, success.uploadedFilesCount) // build.gradle.kts, app/Main.kt, auto-added .github/workflows/android.yml
        assertTrue(success.workflowIncluded)
        assertTrue(success.workflowDispatched)

        val treeArray = JSONObject(uploadedTreeContent).getJSONArray("tree")
        val uploadedPaths = (0 until treeArray.length()).map { idx ->
            treeArray.getJSONObject(idx).getString("path")
        }
        assertTrue(uploadedPaths.contains(".github/workflows/android.yml"))
        assertTrue(uploadedPaths.contains("app/Main.kt"))
        assertTrue(uploadedPaths.contains("build.gradle.kts"))
        assertTrue(seenPaths.contains("POST /repos/builder/my-apk-app/actions/workflows/android.yml/dispatches"))
    }

    @Test
    fun triggerApkBuildWorkflowOnly_dispatchesWorkflowAndReturnsRunUrl() = runTest {
        val storage = InMemoryTokenStorage()
        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient { req ->
                val path = req.url.encodedPath
                when {
                    req.method == "GET" && path == "/user" ->
                        200 to """{"login":"builder","name":"Builder","avatar_url":""}"""
                    req.method == "POST" && path == "/repos/builder/my-apk-app/actions/workflows/android.yml/dispatches" ->
                        204 to ""
                    req.method == "GET" && path == "/repos/builder/my-apk-app/actions/runs" ->
                        200 to """{"total_count":1,"workflow_runs":[{"id":99,"status":"queued","html_url":"https://github.com/builder/my-apk-app/actions/runs/99"}]}"""
                    else -> 404 to """{"message":"Not Found"}"""
                }
            }
        )

        val res = manager.triggerApkBuildWorkflowOnly(
            rawToken = "ghp_good_token_123456",
            rawRepoName = "my-apk-app"
        )

        assertTrue(res is GitHubPushResult.Success)
        val success = res as GitHubPushResult.Success
        assertTrue(success.workflowDispatched)
        assertEquals("https://github.com/builder/my-apk-app/actions/runs/99", success.actionsUrl)
    }

    @Test
    fun pushSourceAndBuildApk_supportsZipSourceAndUnwrapsSingleRootFolder() = runTest {
        val zipFile = tempFolder.newFile("pydroid3-source-code.zip")
        ZipOutputStream(FileOutputStream(zipFile)).use { zos ->
            fun putFile(entryName: String, content: String) {
                zos.putNextEntry(ZipEntry(entryName))
                zos.write(content.toByteArray(Charsets.UTF_8))
                zos.closeEntry()
            }
            putFile("SampleRepo-main/build.gradle.kts", "// gradle root\n")
            putFile("SampleRepo-main/app/src/MainActivity.kt", "class MainActivity\n")
            putFile("SampleRepo-main/build/generated/ignored.txt", "skip build artifact")
            putFile("SampleRepo-main/.git/HEAD", "ref: refs/heads/main")
            putFile("__MACOSX/._SampleRepo-main", "mac metadata")
        }

        var uploadedTreeContent = ""
        val seenPaths = mutableListOf<String>()
        val storage = InMemoryTokenStorage()
        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient { req ->
                val path = req.url.encodedPath
                seenPaths.add("${req.method} $path")
                when {
                    req.method == "GET" && path == "/user" ->
                        200 to """{"login":"builder","name":"Builder","avatar_url":""}"""
                    req.method == "GET" && path == "/repos/builder/samplerepo" ->
                        404 to """{"message":"Not Found"}"""
                    req.method == "POST" && path == "/user/repos" ->
                        201 to """{"name":"samplerepo","default_branch":"main"}"""
                    req.method == "GET" && path == "/repos/builder/samplerepo/git/ref/heads/main" ->
                        200 to """{"object":{"sha":"basecommitsha111"}}"""
                    req.method == "POST" && path == "/repos/builder/samplerepo/git/blobs" ->
                        201 to """{"sha":"blobsha_${seenPaths.size}"}"""
                    req.method == "POST" && path == "/repos/builder/samplerepo/git/trees" -> {
                        val buffer = okio.Buffer()
                        req.body?.writeTo(buffer)
                        uploadedTreeContent = buffer.readUtf8()
                        201 to """{"sha":"treesha_zip_999"}"""
                    }
                    req.method == "POST" && path == "/repos/builder/samplerepo/git/commits" ->
                        201 to """{"sha":"commitsha_zip_888"}"""
                    req.method == "PATCH" && path == "/repos/builder/samplerepo/git/refs/heads/main" ->
                        200 to """{"ref":"refs/heads/main"}"""
                    req.method == "POST" && path == "/repos/builder/samplerepo/actions/workflows/android.yml/dispatches" ->
                        204 to ""
                    req.method == "GET" && path == "/repos/builder/samplerepo/actions/runs" ->
                        200 to """{"total_count":1,"workflow_runs":[{"id":77,"status":"queued","html_url":"https://github.com/builder/samplerepo/actions/runs/77"}]}"""
                    else -> 404 to """{"message":"Unhandled route $path"}"""
                }
            }
        )

        val res = manager.pushSourceAndBuildApk(
            rawToken = "ghp_good_token_zip_123",
            sourceDir = zipFile,
            rawRepoName = "samplerepo"
        )

        assertTrue("Expected Success but got $res", res is GitHubPushResult.Success)
        val success = res as GitHubPushResult.Success
        assertEquals("builder/samplerepo", success.repoFullName)
        assertEquals("https://github.com/builder/samplerepo/actions/runs/77", success.actionsUrl)
        assertEquals(3, success.uploadedFilesCount) // build.gradle.kts, app/src/MainActivity.kt, .github/workflows/android.yml
        assertTrue(success.workflowDispatched)

        val treeArray = JSONObject(uploadedTreeContent).getJSONArray("tree")
        val uploadedPaths = (0 until treeArray.length()).map { idx ->
            treeArray.getJSONObject(idx).getString("path")
        }
        assertTrue(uploadedPaths.contains("build.gradle.kts"))
        assertTrue(uploadedPaths.contains("app/src/MainActivity.kt"))
        assertTrue(uploadedPaths.contains(".github/workflows/android.yml"))
        assertFalse(uploadedPaths.any { it.startsWith("SampleRepo-main/") })
        assertFalse(uploadedPaths.any { it.contains("ignored.txt") || it.contains(".git/") || it.contains("__MACOSX") })
    }

    @Test
    fun pushSourceAndBuildApk_reusesSinglePinnedRepoAcrossMultipleSourcesUntilTokenExpires() = runTest {
        val dir1 = tempFolder.newFolder("AppProjectOne").apply {
            resolve("build.gradle.kts").writeText("// app 1\n")
        }
        val dir2 = tempFolder.newFolder("AppProjectTwo").apply {
            resolve("build.gradle.kts").writeText("// app 2\n")
        }

        var createRepoCalls = 0
        var activeTokenValid = true
        val createdRepos = mutableListOf<String>()
        val pushedRepos = mutableListOf<String>()

        val storage = InMemoryTokenStorage()
        val manager = GitHubApkPushManager(
            storage = storage,
            client = fakeClient { req ->
                val path = req.url.encodedPath
                val auth = req.header("Authorization").orEmpty()
                if (auth == "Bearer ghp_token_one_123" && !activeTokenValid) {
                    return@fakeClient 401 to """{"message":"Bad credentials"}"""
                }
                when {
                    req.method == "GET" && path == "/user" ->
                        200 to """{"login":"builder","name":"Builder","avatar_url":""}"""
                    req.method == "GET" && path == "/repos/builder/filemanagerpro-android" ->
                        if ("filemanagerpro-android" in createdRepos) 200 to """{"name":"filemanagerpro-android","default_branch":"main"}"""
                        else 404 to """{"message":"Not Found"}"""
                    req.method == "GET" && path == "/repos/builder/second-repo-after-expiry" ->
                        if ("second-repo-after-expiry" in createdRepos) 200 to """{"name":"second-repo-after-expiry","default_branch":"main"}"""
                        else 404 to """{"message":"Not Found"}"""
                    req.method == "POST" && path == "/user/repos" -> {
                        val buffer = okio.Buffer()
                        req.body?.writeTo(buffer)
                        val requestedName = JSONObject(buffer.readUtf8()).getString("name")
                        createRepoCalls++
                        createdRepos.add(requestedName)
                        201 to """{"name":"$requestedName","default_branch":"main"}"""
                    }
                    req.method == "GET" && path.endsWith("/git/ref/heads/main") ->
                        200 to """{"object":{"sha":"headsha_1"}}"""
                    req.method == "POST" && path.endsWith("/git/blobs") ->
                        201 to """{"sha":"blobsha_1"}"""
                    req.method == "POST" && path.endsWith("/git/trees") ->
                        201 to """{"sha":"treesha_1"}"""
                    req.method == "POST" && path.endsWith("/git/commits") ->
                        201 to """{"sha":"commitsha_1"}"""
                    req.method == "PATCH" && path.endsWith("/git/refs/heads/main") -> {
                        val repo = path.removePrefix("/repos/builder/").substringBefore("/git/")
                        pushedRepos.add(repo)
                        200 to """{"ref":"refs/heads/main"}"""
                    }
                    req.method == "POST" && path.endsWith("/dispatches") ->
                        204 to ""
                    req.method == "GET" && path.endsWith("/actions/runs") ->
                        200 to """{"total_count":1,"workflow_runs":[{"id":1,"status":"queued","html_url":"https://github.com/builder/filemanagerpro-android/actions/runs/1"}]}"""
                    else -> 404 to """{"message":"Unhandled $path"}"""
                }
            }
        )

        // First push creates the single default repo and pins it to the active token
        val firstRes = manager.pushSourceAndBuildApk("ghp_token_one_123", dir1, "filemanagerpro-android")
        assertTrue(firstRes is GitHubPushResult.Success)
        assertEquals(1, createRepoCalls)
        assertEquals("filemanagerpro-android", storage.getPinnedRepoName())

        // Second push with the SAME token and a different project/repo name MUST still push to pinned default repo
        val secondRes = manager.pushSourceAndBuildApk("ghp_token_one_123", dir2, "completely-different-name")
        assertTrue(secondRes is GitHubPushResult.Success)
        assertEquals("builder/filemanagerpro-android", (secondRes as GitHubPushResult.Success).repoFullName)
        assertEquals(1, createRepoCalls) // No extra repo created!
        assertEquals(listOf("filemanagerpro-android", "filemanagerpro-android"), pushedRepos)

        // When token expires (401), token and pinned repo lock are cleared cleanly
        activeTokenValid = false
        val expiredRes = manager.pushSourceAndBuildApk("ghp_token_one_123", dir2, "filemanagerpro-android")
        assertTrue(expiredRes is GitHubPushResult.AuthError)
        assertEquals("", storage.getToken())
        assertEquals("", storage.getPinnedRepoName())

        // With a brand-new token after expiry, user can bind a new default repo
        val thirdRes = manager.pushSourceAndBuildApk("ghp_token_two_456", dir2, "second-repo-after-expiry")
        assertTrue(thirdRes is GitHubPushResult.Success)
        assertEquals("builder/second-repo-after-expiry", (thirdRes as GitHubPushResult.Success).repoFullName)
        assertEquals(2, createRepoCalls)
    }
}
