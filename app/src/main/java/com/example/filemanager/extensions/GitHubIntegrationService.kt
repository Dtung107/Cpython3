package com.example.filemanager.extensions

import com.example.filemanager.extensions.network.CreateBlobRequestDto
import com.example.filemanager.extensions.network.CreateCommitRequestDto
import com.example.filemanager.extensions.network.CreateRepoRequestDto
import com.example.filemanager.extensions.network.CreateTreeRequestDto
import com.example.filemanager.extensions.network.GitHubApiService
import com.example.filemanager.extensions.network.GitHubApiServiceFactory
import com.example.filemanager.extensions.network.GitTreeEntryDto
import com.example.filemanager.extensions.network.PutFileContentRequestDto
import com.example.filemanager.extensions.network.UpdateRefRequestDto
import com.example.filemanager.extensions.network.WorkflowDispatchRequestDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import org.json.JSONObject
import retrofit2.Response
import java.util.Base64

data class SourceCodeEntry(
    val relativePath: String,
    val bytes: ByteArray,
    val executable: Boolean = false
)

data class GitHubRepositoryInfo(
    val owner: String,
    val name: String,
    val fullName: String,
    val htmlUrl: String,
    val defaultBranch: String,
    val createdFreshly: Boolean
)

data class GitPushSummary(
    val commitSha: String,
    val treeSha: String,
    val branch: String,
    val uploadedFilesCount: Int,
    val workflowFilePath: String?
)

data class WorkflowDispatchSummary(
    val workflowId: String,
    val dispatchedExplicitly: Boolean,
    val actionsUrl: String,
    val latestRunUrl: String?,
    val latestRunStatus: String?
)

sealed interface ServiceCallResult<out T> {
    data class Success<T>(val data: T) : ServiceCallResult<T>
    data class AuthExpired(val message: String) : ServiceCallResult<Nothing>
    data class HttpFailure(val code: Int, val message: String) : ServiceCallResult<Nothing>
    data class NetworkFailure(val message: String) : ServiceCallResult<Nothing>
}

/**
 * Service layer coordinating all GitHub REST endpoints:
 * 1. Verifying Personal Access Tokens
 * 2. Creating / retrieving repositories
 * 3. Pushing full source code trees
 * 4. Triggering GitHub Actions workflows to build Android APKs
 */
class GitHubIntegrationService(
    private val api: GitHubApiService
) {
    constructor(
        client: OkHttpClient = GitHubApiServiceFactory.defaultOkHttpClient(),
        baseUrl: String = GitHubApiServiceFactory.DEFAULT_BASE_URL
    ) : this(GitHubApiServiceFactory.create(client, baseUrl))

    suspend fun verifyPersonalAccessToken(rawToken: String): ServiceCallResult<Pair<GitHubUserProfile, String>> {
        val cleanToken = GitHubApkPushManager.sanitizeToken(rawToken)
        if (cleanToken.isBlank()) {
            return ServiceCallResult.AuthExpired("Mã GitHub Token trống hoặc không hợp lệ.")
        }
        return withContext(Dispatchers.IO) {
            safeApiCall(cleanToken) {
                val response = api.getAuthenticatedUser("Bearer $cleanToken")
                if (response.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired(
                        "Mã GitHub Token không đúng hoặc đã hết hạn (401 Bad credentials)."
                    )
                }
                if (!response.isSuccessful) {
                    val apiMsg = parseGitHubError(response)
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        response.code(),
                        GitHubApkPushManager.redactToken(
                            "GitHub từ chối xác thực (HTTP ${response.code()}): $apiMsg",
                            cleanToken
                        )
                    )
                }
                val dto = response.body()
                if (dto == null || dto.login.isBlank()) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        response.code(),
                        "Không đọc được thông tin tài khoản GitHub."
                    )
                }
                val scopes = response.headers()["X-OAuth-Scopes"].orEmpty()
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }

                val profile = GitHubUserProfile(
                    login = dto.login,
                    name = dto.name?.takeIf { it.isNotBlank() && it != "null" } ?: dto.login,
                    avatarUrl = dto.avatarUrl?.takeIf { it != "null" }.orEmpty(),
                    scopes = scopes
                )
                ServiceCallResult.Success(profile to cleanToken)
            }
        }
    }

    suspend fun createOrGetRepository(
        rawToken: String,
        owner: String,
        repoName: String,
        isPrivate: Boolean = false,
        description: String = "Android project pushed by File Manager Pro for automated APK CI/CD"
    ): ServiceCallResult<GitHubRepositoryInfo> {
        val cleanToken = GitHubApkPushManager.sanitizeToken(rawToken)
        val cleanRepo = GitHubApkPushManager.sanitizeRepoName(repoName)
        if (cleanToken.isBlank()) {
            return ServiceCallResult.AuthExpired("Thiếu GitHub Token hợp lệ.")
        }
        if (cleanRepo.isBlank()) {
            return ServiceCallResult.HttpFailure(400, "Tên kho lưu trữ không hợp lệ.")
        }

        return withContext(Dispatchers.IO) {
            safeApiCall(cleanToken) {
                val auth = "Bearer $cleanToken"
                val existing = api.getRepository(auth, owner, cleanRepo)
                if (existing.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }
                if (existing.isSuccessful) {
                    val body = existing.body()
                    val branch = body?.defaultBranch?.takeIf { it.isNotBlank() && it != "null" } ?: "main"
                    val fullName = body?.fullName?.takeIf { it.isNotBlank() } ?: "$owner/$cleanRepo"
                    val htmlUrl = body?.htmlUrl?.takeIf { it.isNotBlank() } ?: "https://github.com/$fullName"
                    return@safeApiCall ServiceCallResult.Success(
                        GitHubRepositoryInfo(
                            owner = owner,
                            name = cleanRepo,
                            fullName = fullName,
                            htmlUrl = htmlUrl,
                            defaultBranch = branch,
                            createdFreshly = false
                        )
                    )
                }
                if (existing.code() != 404) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        existing.code(),
                        "Không truy cập được repo (HTTP ${existing.code()}): ${parseGitHubError(existing)}"
                    )
                }

                // Auto-create repository when not found
                val created = api.createRepository(
                    authorization = auth,
                    request = CreateRepoRequestDto(
                        name = cleanRepo,
                        isPrivate = isPrivate,
                        autoInit = true,
                        description = description
                    )
                )
                if (created.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }
                if (!created.isSuccessful) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        created.code(),
                        "Không tạo được repo '$cleanRepo' (HTTP ${created.code()}): ${parseGitHubError(created)}"
                    )
                }
                val body = created.body()
                val branch = body?.defaultBranch?.takeIf { it.isNotBlank() && it != "null" } ?: "main"
                val fullName = body?.fullName?.takeIf { it.isNotBlank() } ?: "$owner/$cleanRepo"
                val htmlUrl = body?.htmlUrl?.takeIf { it.isNotBlank() } ?: "https://github.com/$fullName"
                ServiceCallResult.Success(
                    GitHubRepositoryInfo(
                        owner = owner,
                        name = cleanRepo,
                        fullName = fullName,
                        htmlUrl = htmlUrl,
                        defaultBranch = branch,
                        createdFreshly = true
                    )
                )
            }
        }
    }

    suspend fun pushCodeDirectory(
        rawToken: String,
        owner: String,
        repoName: String,
        branch: String,
        entries: List<SourceCodeEntry>,
        commitMessage: String = "🚀 Push full source & trigger APK build via File Manager Pro",
        onProgress: (Float, String) -> Unit = { _, _ -> }
    ): ServiceCallResult<GitPushSummary> {
        val cleanToken = GitHubApkPushManager.sanitizeToken(rawToken)
        if (cleanToken.isBlank()) {
            return ServiceCallResult.AuthExpired("Thiếu GitHub Token hợp lệ.")
        }
        if (entries.isEmpty()) {
            return ServiceCallResult.HttpFailure(400, "Không có tệp mã nguồn nào để đẩy lên GitHub.")
        }

        return withContext(Dispatchers.IO) {
            safeApiCall(cleanToken) {
                val auth = "Bearer $cleanToken"

                // 1. Ensure initial branch HEAD exists
                val parentSha = when (val headRes = ensureBranchHeadSha(auth, owner, repoName, branch)) {
                    is ServiceCallResult.Success -> headRes.data
                    is ServiceCallResult.AuthExpired -> return@safeApiCall headRes
                    is ServiceCallResult.HttpFailure -> return@safeApiCall headRes
                    is ServiceCallResult.NetworkFailure -> return@safeApiCall headRes
                }

                // 2. Upload Git blobs
                val treeEntries = ArrayList<GitTreeEntryDto>(entries.size)
                entries.forEachIndexed { index, entry ->
                    val pct = 0.25f + (0.50f * (index + 1).toFloat() / entries.size.toFloat())
                    onProgress(pct, "Đang đẩy tệp (${index + 1}/${entries.size}): ${entry.relativePath}")

                    val blobResp = api.createBlob(
                        authorization = auth,
                        owner = owner,
                        repo = repoName,
                        request = CreateBlobRequestDto(
                            base64Content = Base64.getEncoder().encodeToString(entry.bytes),
                            encoding = "base64"
                        )
                    )
                    if (blobResp.code() == 401) {
                        return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                    }
                    if (!blobResp.isSuccessful) {
                        return@safeApiCall ServiceCallResult.HttpFailure(
                            blobResp.code(),
                            "Lỗi tải tệp ${entry.relativePath} (HTTP ${blobResp.code()}): ${parseGitHubError(blobResp)}"
                        )
                    }
                    val blobSha = blobResp.body()?.sha.orEmpty()
                    if (blobSha.isBlank()) {
                        return@safeApiCall ServiceCallResult.HttpFailure(500, "GitHub không trả về SHA cho tệp ${entry.relativePath}.")
                    }

                    treeEntries.add(
                        GitTreeEntryDto(
                            path = entry.relativePath,
                            mode = if (entry.executable) "100755" else "100644",
                            type = "blob",
                            sha = blobSha
                        )
                    )
                }

                // 3. Create Git tree
                onProgress(0.80f, "Đang tạo cây mã nguồn Git...")
                val treeResp = api.createTree(
                    authorization = auth,
                    owner = owner,
                    repo = repoName,
                    request = CreateTreeRequestDto(tree = treeEntries, baseTree = null)
                )
                if (treeResp.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }
                if (!treeResp.isSuccessful) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        treeResp.code(),
                        "Lỗi tạo cây Git (HTTP ${treeResp.code()}): ${parseGitHubError(treeResp)}"
                    )
                }
                val treeSha = treeResp.body()?.sha.orEmpty()
                if (treeSha.isBlank()) {
                    return@safeApiCall ServiceCallResult.HttpFailure(500, "Không nhận được SHA của cây Git.")
                }

                // 4. Create Git commit
                onProgress(0.88f, "Đang tạo commit & đồng bộ mã nguồn...")
                val parents = if (parentSha.isNullOrBlank()) emptyList() else listOf(parentSha)
                val commitResp = api.createCommit(
                    authorization = auth,
                    owner = owner,
                    repo = repoName,
                    request = CreateCommitRequestDto(
                        message = commitMessage,
                        tree = treeSha,
                        parents = parents
                    )
                )
                if (commitResp.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }
                if (!commitResp.isSuccessful) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        commitResp.code(),
                        "Lỗi tạo commit (HTTP ${commitResp.code()}): ${parseGitHubError(commitResp)}"
                    )
                }
                val commitSha = commitResp.body()?.sha.orEmpty()
                if (commitSha.isBlank()) {
                    return@safeApiCall ServiceCallResult.HttpFailure(500, "Không nhận được SHA của commit.")
                }

                // 5. Update branch ref (automatically starts on: push GitHub Actions)
                onProgress(0.93f, "Đang cập nhật nhánh $branch...")
                val refResp = api.updateBranchRef(
                    authorization = auth,
                    owner = owner,
                    repo = repoName,
                    branch = branch,
                    request = UpdateRefRequestDto(sha = commitSha, force = true)
                )
                if (refResp.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }
                if (!refResp.isSuccessful) {
                    val hint = if (refResp.code() == 403 || refResp.code() == 404) {
                        " (Kiểm tra lại Token đã bật đủ quyền 'repo' và 'workflow')"
                    } else ""
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        refResp.code(),
                        "Lỗi đẩy nhánh $branch (HTTP ${refResp.code()}): ${parseGitHubError(refResp)}$hint"
                    )
                }

                val workflowPath = entries.firstOrNull {
                    it.relativePath.startsWith(".github/workflows/") &&
                        (it.relativePath.endsWith(".yml") || it.relativePath.endsWith(".yaml"))
                }?.relativePath

                ServiceCallResult.Success(
                    GitPushSummary(
                        commitSha = commitSha,
                        treeSha = treeSha,
                        branch = branch,
                        uploadedFilesCount = entries.size,
                        workflowFilePath = workflowPath
                    )
                )
            }
        }
    }

    /**
     * Triggers the GitHub Actions APK build workflow explicitly via workflow_dispatch
     * (`POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`)
     * and inspects the latest run URL so the user can jump directly to the APK build progress.
     */
    suspend fun triggerApkWorkflowBuild(
        rawToken: String,
        owner: String,
        repoName: String,
        workflowFileName: String = DEFAULT_WORKFLOW_FILE,
        ref: String = "main",
        inputs: Map<String, String> = emptyMap()
    ): ServiceCallResult<WorkflowDispatchSummary> {
        val cleanToken = GitHubApkPushManager.sanitizeToken(rawToken)
        if (cleanToken.isBlank()) {
            return ServiceCallResult.AuthExpired("Thiếu GitHub Token hợp lệ.")
        }

        val workflowId = workflowFileName.substringAfterLast('/').ifBlank { DEFAULT_WORKFLOW_FILE }
        val actionsUrl = "https://github.com/$owner/$repoName/actions"

        return withContext(Dispatchers.IO) {
            safeApiCall(cleanToken) {
                val auth = "Bearer $cleanToken"
                val dispatchResp = api.dispatchWorkflow(
                    authorization = auth,
                    owner = owner,
                    repo = repoName,
                    workflowId = workflowId,
                    request = WorkflowDispatchRequestDto(ref = ref, inputs = inputs)
                )

                if (dispatchResp.code() == 401) {
                    return@safeApiCall ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
                }

                // GitHub returns 204 No Content on successful workflow_dispatch.
                // Note: Immediately after a brand new repo push, GitHub may take a moment to index the new
                // workflow file for dispatch (404/422), even though `on: push` already queued it cleanly.
                val dispatchedExplicitly = dispatchResp.isSuccessful
                if (!dispatchedExplicitly && dispatchResp.code() !in setOf(404, 422)) {
                    return@safeApiCall ServiceCallResult.HttpFailure(
                        dispatchResp.code(),
                        "Không kích hoạt được workflow '$workflowId' (HTTP ${dispatchResp.code()}): ${parseGitHubError(dispatchResp)}"
                    )
                }

                val latestRun = try {
                    val runsResp = api.listWorkflowRuns(auth, owner, repoName, perPage = 3)
                    if (runsResp.isSuccessful) {
                        runsResp.body()?.workflowRuns?.firstOrNull()
                    } else null
                } catch (_: Exception) {
                    null
                }

                ServiceCallResult.Success(
                    WorkflowDispatchSummary(
                        workflowId = workflowId,
                        dispatchedExplicitly = dispatchedExplicitly,
                        actionsUrl = actionsUrl,
                        latestRunUrl = latestRun?.htmlUrl?.takeIf { it.isNotBlank() },
                        latestRunStatus = latestRun?.status
                    )
                )
            }
        }
    }

    private suspend fun ensureBranchHeadSha(
        authHeader: String,
        owner: String,
        repoName: String,
        branch: String
    ): ServiceCallResult<String?> {
        val refResp = api.getBranchRef(authHeader, owner, repoName, branch)
        if (refResp.code() == 401) {
            return ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
        }
        if (refResp.isSuccessful) {
            val sha = refResp.body()?.obj?.sha
            if (!sha.isNullOrBlank()) {
                return ServiceCallResult.Success(sha)
            }
        }

        // Fallback if repository has no initial commit yet: seed README.md via Contents API
        val readmeBytes = "# $repoName\nPushed via File Manager Pro\n".toByteArray(Charsets.UTF_8)
        val seedResp = api.putFileContent(
            authorization = authHeader,
            owner = owner,
            repo = repoName,
            path = "README.md",
            request = PutFileContentRequestDto(
                message = "Initialize repository for File Manager Pro APK CI/CD",
                base64Content = Base64.getEncoder().encodeToString(readmeBytes),
                branch = branch
            )
        )
        if (seedResp.code() == 401) {
            return ServiceCallResult.AuthExpired("Mã Token không hợp lệ hoặc đã hết hạn (401).")
        }
        if (!seedResp.isSuccessful) {
            return ServiceCallResult.HttpFailure(
                seedResp.code(),
                "Không khởi tạo được commit gốc (HTTP ${seedResp.code()}): ${parseGitHubError(seedResp)}"
            )
        }
        return ServiceCallResult.Success(seedResp.body()?.commit?.sha)
    }

    private inline fun <T> safeApiCall(
        cleanToken: String,
        block: () -> ServiceCallResult<T>
    ): ServiceCallResult<T> {
        return try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ServiceCallResult.NetworkFailure(
                GitHubApkPushManager.redactToken(
                    "Lỗi kết nối GitHub API: ${e.localizedMessage ?: "Vui lòng kiểm tra mạng"}",
                    cleanToken
                )
            )
        }
    }

    private fun parseGitHubError(response: Response<*>): String {
        val raw = try {
            response.errorBody()?.string().orEmpty()
        } catch (_: Exception) {
            ""
        }
        if (raw.isBlank()) return "Không có phản hồi chi tiết"
        return try {
            JSONObject(raw).optString("message").takeIf { it.isNotBlank() } ?: raw.take(180)
        } catch (_: Exception) {
            raw.take(180)
        }
    }

    companion object {
        const val DEFAULT_WORKFLOW_FILE = "android.yml"
    }
}
