package com.example.filemanager.extensions

import android.content.Context
import android.content.SharedPreferences
import com.example.filemanager.extensions.network.GitHubApiServiceFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.util.zip.ZipInputStream

data class GitHubUserProfile(
    val login: String,
    val name: String,
    val avatarUrl: String,
    val scopes: List<String> = emptyList()
) {
    val hasRepoScope: Boolean
        get() = scopes.isEmpty() || scopes.any { it.equals("repo", ignoreCase = true) || it.equals("public_repo", ignoreCase = true) }

    val hasWorkflowScope: Boolean
        get() = scopes.isEmpty() || scopes.any { it.equals("workflow", ignoreCase = true) }
}

sealed interface TokenValidationResult {
    data class Valid(val user: GitHubUserProfile, val sanitizedToken: String) : TokenValidationResult
    data class InvalidOrExpired(
        val message: String,
        val guideSteps: List<String>,
        val wasClearedFromStorage: Boolean
    ) : TokenValidationResult
    data class NetworkFailure(val message: String) : TokenValidationResult
}

sealed interface GitHubPushResult {
    data class Success(
        val repoFullName: String,
        val repoUrl: String,
        val actionsUrl: String,
        val uploadedFilesCount: Int,
        val workflowIncluded: Boolean,
        val workflowDispatched: Boolean = false
    ) : GitHubPushResult

    data class AuthError(
        val message: String,
        val guideSteps: List<String>
    ) : GitHubPushResult

    data class Failure(val message: String) : GitHubPushResult
}

data class GitHubExtensionState(
    val verifiedToken: String = "",
    val verifiedUser: GitHubUserProfile? = null,
    val savedRepoName: String = DEFAULT_REPO_NAME,
    val pinnedRepoName: String = "",
    val singleDefaultRepoMode: Boolean = true,
    val savedSourceDirPath: String = "",
    val isValidating: Boolean = false,
    val isPushing: Boolean = false,
    val pushProgress: Float = 0f,
    val pushStatusText: String = "",
    val validationNotice: String? = null,
    val validationIsError: Boolean = false,
    val validationGuideSteps: List<String> = emptyList(),
    val lastPushSuccess: GitHubPushResult.Success? = null,
    val lastPushError: String? = null
) {
    val effectiveRepoName: String
        get() = if (singleDefaultRepoMode) {
            pinnedRepoName.ifBlank { savedRepoName }.ifBlank { DEFAULT_REPO_NAME }
        } else {
            savedRepoName.ifBlank { DEFAULT_REPO_NAME }
        }

    companion object {
        const val DEFAULT_REPO_NAME = "filemanagerpro-android"
    }
}

/**
 * Token store abstraction so both Android SharedPreferences and JVM unit tests
 * enforce the same verify-before-save & auto-wipe-on-401 security policy.
 */
interface GitHubTokenStorage {
    fun getToken(): String
    fun saveVerifiedToken(token: String, user: GitHubUserProfile)
    fun clearToken()
    fun getUser(): GitHubUserProfile?
    fun getRepoName(): String
    fun saveRepoName(name: String)
    fun getPinnedRepoName(): String
    fun savePinnedRepoName(name: String)
    fun isSingleDefaultRepoMode(): Boolean
    fun setSingleDefaultRepoMode(enabled: Boolean)
    fun getSourceDirPath(): String
    fun saveSourceDirPath(path: String)
}

class PrefsGitHubTokenStorage(context: Context) : GitHubTokenStorage {
    private val prefs: SharedPreferences = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun getToken(): String = prefs.getString(KEY_VERIFIED_TOKEN, "") ?: ""

    override fun saveVerifiedToken(token: String, user: GitHubUserProfile) {
        val previousToken = getToken()
        val editor = prefs.edit()
            .putString(KEY_VERIFIED_TOKEN, token)
            .putString(KEY_USER_LOGIN, user.login)
            .putString(KEY_USER_NAME, user.name)
            .putString(KEY_USER_AVATAR, user.avatarUrl)
            .putString(KEY_USER_SCOPES, user.scopes.joinToString(","))
        if (previousToken.isNotBlank() && previousToken != token) {
            editor.remove(KEY_PINNED_REPO_NAME)
            editor.putString(KEY_REPO_NAME, GitHubExtensionState.DEFAULT_REPO_NAME)
        }
        editor.apply()
    }

    override fun clearToken() {
        prefs.edit()
            .remove(KEY_VERIFIED_TOKEN)
            .remove(KEY_USER_LOGIN)
            .remove(KEY_USER_NAME)
            .remove(KEY_USER_AVATAR)
            .remove(KEY_USER_SCOPES)
            .remove(KEY_PINNED_REPO_NAME)
            .putString(KEY_REPO_NAME, GitHubExtensionState.DEFAULT_REPO_NAME)
            .apply()
    }

    override fun getUser(): GitHubUserProfile? {
        val token = getToken()
        val login = prefs.getString(KEY_USER_LOGIN, null)
        if (token.isBlank() || login.isNullOrBlank()) return null
        val scopesRaw = prefs.getString(KEY_USER_SCOPES, "").orEmpty()
        return GitHubUserProfile(
            login = login,
            name = prefs.getString(KEY_USER_NAME, login) ?: login,
            avatarUrl = prefs.getString(KEY_USER_AVATAR, "") ?: "",
            scopes = scopesRaw.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        )
    }

    override fun getRepoName(): String =
        prefs.getString(KEY_REPO_NAME, GitHubExtensionState.DEFAULT_REPO_NAME)
            ?.takeIf { it.isNotBlank() }
            ?: GitHubExtensionState.DEFAULT_REPO_NAME

    override fun saveRepoName(name: String) {
        prefs.edit().putString(KEY_REPO_NAME, name).apply()
    }

    override fun getPinnedRepoName(): String =
        prefs.getString(KEY_PINNED_REPO_NAME, "") ?: ""

    override fun savePinnedRepoName(name: String) {
        prefs.edit().putString(KEY_PINNED_REPO_NAME, name).apply()
    }

    override fun isSingleDefaultRepoMode(): Boolean =
        prefs.getBoolean(KEY_SINGLE_REPO_MODE, true)

    override fun setSingleDefaultRepoMode(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_SINGLE_REPO_MODE, enabled).apply()
    }

    override fun getSourceDirPath(): String = prefs.getString(KEY_SOURCE_DIR, "") ?: ""

    override fun saveSourceDirPath(path: String) {
        prefs.edit().putString(KEY_SOURCE_DIR, path).apply()
    }

    private companion object {
        const val PREFS_NAME = "file_manager_github_ext_prefs"
        const val KEY_VERIFIED_TOKEN = "verified_github_token"
        const val KEY_USER_LOGIN = "verified_github_login"
        const val KEY_USER_NAME = "verified_github_name"
        const val KEY_USER_AVATAR = "verified_github_avatar"
        const val KEY_USER_SCOPES = "verified_github_scopes"
        const val KEY_REPO_NAME = "last_repo_name"
        const val KEY_PINNED_REPO_NAME = "pinned_repo_name"
        const val KEY_SINGLE_REPO_MODE = "single_default_repo_mode"
        const val KEY_SOURCE_DIR = "last_source_dir"
    }
}

class GitHubApkPushManager(
    private val storage: GitHubTokenStorage,
    private val service: GitHubIntegrationService
) {
    constructor(
        storage: GitHubTokenStorage,
        client: OkHttpClient = GitHubApiServiceFactory.defaultOkHttpClient(),
        apiBaseUrl: String = GitHubApiServiceFactory.DEFAULT_BASE_URL
    ) : this(
        storage = storage,
        service = GitHubIntegrationService(client = client, baseUrl = apiBaseUrl)
    )

    private val _state = MutableStateFlow(
        GitHubExtensionState(
            verifiedToken = storage.getToken(),
            verifiedUser = storage.getUser(),
            savedRepoName = storage.getRepoName(),
            pinnedRepoName = storage.getPinnedRepoName(),
            singleDefaultRepoMode = storage.isSingleDefaultRepoMode(),
            savedSourceDirPath = storage.getSourceDirPath()
        )
    )
    val state: StateFlow<GitHubExtensionState> = _state.asStateFlow()

    fun setSingleDefaultRepoMode(enabled: Boolean) {
        storage.setSingleDefaultRepoMode(enabled)
        _state.value = _state.value.copy(singleDefaultRepoMode = enabled)
    }

    fun updateRepoAndFolderPreferences(repoName: String, sourceDirPath: String) {
        val current = _state.value
        val resolvedRepo = if (current.singleDefaultRepoMode && current.pinnedRepoName.isNotBlank()) {
            current.pinnedRepoName
        } else {
            sanitizeRepoName(repoName).ifBlank { GitHubExtensionState.DEFAULT_REPO_NAME }
        }
        storage.saveRepoName(resolvedRepo)
        storage.saveSourceDirPath(sourceDirPath)
        _state.value = _state.value.copy(
            savedRepoName = resolvedRepo,
            savedSourceDirPath = sourceDirPath
        )
    }

    fun clearSavedToken(notice: String? = null) {
        storage.clearToken()
        _state.value = _state.value.copy(
            verifiedToken = "",
            verifiedUser = null,
            pinnedRepoName = "",
            savedRepoName = GitHubExtensionState.DEFAULT_REPO_NAME,
            validationNotice = notice,
            validationIsError = false,
            validationGuideSteps = emptyList(),
            lastPushError = null
        )
    }

    fun clearNotices() {
        _state.value = _state.value.copy(
            validationNotice = null,
            validationIsError = false,
            validationGuideSteps = emptyList(),
            lastPushError = null
        )
    }

    /**
     * Validates the token against GitHub GET /user BEFORE saving it to storage.
     * - If HTTP 200: saves the sanitized token and updates verified user state.
     * - If HTTP 401 (or invalid format): clears any previously saved stale token from storage
     *   and returns friendly UI guidance without throwing exceptions or logging sensitive data.
     */
    suspend fun validateAndSaveToken(rawToken: String): TokenValidationResult {
        val cleanToken = sanitizeToken(rawToken)
        if (cleanToken.isBlank()) {
            val hadSaved = storage.getToken().isNotBlank()
            storage.clearToken()
            val guide = invalidTokenGuideSteps()
            val msg = "Vui lòng dán mã truy cập cá nhân GitHub hợp lệ (bắt đầu bằng ghp_... hoặc github_pat_...)."
            _state.value = _state.value.copy(
                verifiedToken = "",
                verifiedUser = null,
                pinnedRepoName = "",
                savedRepoName = GitHubExtensionState.DEFAULT_REPO_NAME,
                isValidating = false,
                validationNotice = msg,
                validationIsError = true,
                validationGuideSteps = guide
            )
            return TokenValidationResult.InvalidOrExpired(msg, guide, hadSaved)
        }

        _state.value = _state.value.copy(
            isValidating = true,
            validationNotice = null,
            validationIsError = false,
            validationGuideSteps = emptyList()
        )

        val previousToken = storage.getToken()
        return when (val verifyRes = service.verifyPersonalAccessToken(cleanToken)) {
            is ServiceCallResult.Success -> {
                val (user, sanitized) = verifyRes.data
                val tokenChanged = previousToken.isNotBlank() && previousToken != sanitized
                storage.saveVerifiedToken(sanitized, user)
                val scopeWarning = buildString {
                    append("Đã xác thực thành công tài khoản @${user.login}.")
                    if (!user.hasRepoScope || !user.hasWorkflowScope) {
                        append(" Lưu ý: Token nên có đủ quyền 'repo' và 'workflow' để tự động tạo file .APK.")
                    }
                }
                _state.value = _state.value.copy(
                    verifiedToken = sanitized,
                    verifiedUser = user,
                    pinnedRepoName = if (tokenChanged) "" else storage.getPinnedRepoName(),
                    savedRepoName = storage.getRepoName(),
                    isValidating = false,
                    validationNotice = scopeWarning,
                    validationIsError = false,
                    validationGuideSteps = emptyList(),
                    lastPushError = null
                )
                TokenValidationResult.Valid(user = user, sanitizedToken = sanitized)
            }

            is ServiceCallResult.AuthExpired -> {
                val hadSaved = storage.getToken().isNotBlank()
                storage.clearToken()
                val msg = "Mã GitHub Token không đúng hoặc đã hết hạn (401 Bad credentials). Token lỗi đã được tự động xóa khỏi bộ nhớ."
                val guide = invalidTokenGuideSteps()
                _state.value = _state.value.copy(
                    verifiedToken = "",
                    verifiedUser = null,
                    pinnedRepoName = "",
                    savedRepoName = GitHubExtensionState.DEFAULT_REPO_NAME,
                    isValidating = false,
                    validationNotice = msg,
                    validationIsError = true,
                    validationGuideSteps = guide
                )
                TokenValidationResult.InvalidOrExpired(
                    message = msg,
                    guideSteps = guide,
                    wasClearedFromStorage = hadSaved
                )
            }

            is ServiceCallResult.HttpFailure -> {
                _state.value = _state.value.copy(
                    isValidating = false,
                    validationNotice = verifyRes.message,
                    validationIsError = true,
                    validationGuideSteps = emptyList()
                )
                TokenValidationResult.NetworkFailure(verifyRes.message)
            }

            is ServiceCallResult.NetworkFailure -> {
                _state.value = _state.value.copy(
                    isValidating = false,
                    validationNotice = verifyRes.message,
                    validationIsError = true,
                    validationGuideSteps = emptyList()
                )
                TokenValidationResult.NetworkFailure(verifyRes.message)
            }
        }
    }

    /**
     * Pushes all project source files from [sourceDir] via [GitHubIntegrationService]
     * (auto-creating repository and adding .github/workflows/android.yml if missing),
     * then triggers GitHub Actions workflow compilation for the .APK.
     */
    suspend fun pushSourceAndBuildApk(
        rawToken: String,
        sourceDir: File,
        rawRepoName: String,
        isPrivate: Boolean = false
    ): GitHubPushResult {
        val sanitizedRequested = sanitizeRepoName(rawRepoName)
        if (sanitizedRequested.isBlank()) {
            val err = "Tên kho lưu trữ (Repository) không hợp lệ. Chỉ dùng chữ, số, dấu gạch ngang hoặc chấm."
            _state.value = _state.value.copy(lastPushError = err)
            return GitHubPushResult.Failure(err)
        }
        if (!sourceDir.exists() || (!sourceDir.isDirectory && !sourceDir.extension.equals("zip", ignoreCase = true))) {
            val err = "Thư mục hoặc tệp .zip mã nguồn không tồn tại hoặc không hợp lệ: ${sourceDir.absolutePath}"
            _state.value = _state.value.copy(lastPushError = err)
            return GitHubPushResult.Failure(err)
        }

        storage.saveSourceDirPath(sourceDir.absolutePath)

        _state.value = _state.value.copy(
            savedSourceDirPath = sourceDir.absolutePath,
            isPushing = true,
            pushProgress = 0.05f,
            pushStatusText = "Đang kiểm tra xác thực GitHub Token...",
            lastPushError = null,
            lastPushSuccess = null
        )

        // Step 1: Verify & save token before proceeding
        val tokenInput = rawToken.ifBlank { storage.getToken() }
        val validation = validateAndSaveToken(tokenInput)
        val validResult = when (validation) {
            is TokenValidationResult.Valid -> validation
            is TokenValidationResult.InvalidOrExpired -> {
                _state.value = _state.value.copy(
                    isPushing = false,
                    pushProgress = 0f,
                    pushStatusText = "",
                    lastPushError = validation.message
                )
                return GitHubPushResult.AuthError(validation.message, validation.guideSteps)
            }
            is TokenValidationResult.NetworkFailure -> {
                _state.value = _state.value.copy(
                    isPushing = false,
                    pushProgress = 0f,
                    pushStatusText = "",
                    lastPushError = validation.message
                )
                return GitHubPushResult.Failure(validation.message)
            }
        }

        val cleanToken = validResult.sanitizedToken
        val owner = validResult.user.login
        val currentPinned = storage.getPinnedRepoName()
        val repoName = if (_state.value.singleDefaultRepoMode && currentPinned.isNotBlank()) {
            currentPinned
        } else {
            sanitizedRequested
        }
        storage.saveRepoName(repoName)
        _state.value = _state.value.copy(savedRepoName = repoName)

        return try {
            // Step 2: Create or retrieve repository via GitHubIntegrationService
            updateProgress(0.12f, "Đang kiểm tra hoặc tạo kho lưu trữ $owner/$repoName...")
            val repoInfo = when (val repoRes = service.createOrGetRepository(cleanToken, owner, repoName, isPrivate)) {
                is ServiceCallResult.Success -> repoRes.data
                is ServiceCallResult.AuthExpired -> {
                    handle401DuringPush()
                    return GitHubPushResult.AuthError(repoRes.message, invalidTokenGuideSteps())
                }
                is ServiceCallResult.HttpFailure -> return failPush(repoRes.message)
                is ServiceCallResult.NetworkFailure -> return failPush(repoRes.message)
            }

            if (_state.value.singleDefaultRepoMode && storage.getPinnedRepoName().isBlank()) {
                storage.savePinnedRepoName(repoInfo.name)
                _state.value = _state.value.copy(pinnedRepoName = repoInfo.name)
            }

            // Step 3: Collect source files (from Directory or .ZIP) & ensure .github/workflows/android.yml exists
            updateProgress(
                0.22f,
                if (sourceDir.isFile) "Đang giải nén & quét 100% mã nguồn từ tệp .zip..."
                else "Đang quét 100% mã nguồn trong thư mục..."
            )
            val entries = withContext(Dispatchers.IO) {
                val collected = if (sourceDir.isFile && sourceDir.extension.equals("zip", ignoreCase = true)) {
                    collectEntriesFromZip(sourceDir).toMutableList()
                } else {
                    collectProjectFiles(sourceDir).toMutableList()
                }
                val hasExistingWorkflow = collected.any {
                    it.relativePath.startsWith(".github/workflows/") &&
                        (it.relativePath.endsWith(".yml") || it.relativePath.endsWith(".yaml"))
                }
                if (!hasExistingWorkflow) {
                    collected.add(
                        SourceCodeEntry(
                            relativePath = ".github/workflows/${GitHubIntegrationService.DEFAULT_WORKFLOW_FILE}",
                            bytes = DEFAULT_ANDROID_APK_WORKFLOW.toByteArray(Charsets.UTF_8),
                            executable = false
                        )
                    )
                }
                collected
            }

            if (entries.isEmpty()) {
                return failPush("Nguồn đã chọn không chứa tệp mã nguồn hợp lệ nào để đẩy lên GitHub.")
            }

            // Step 4: Push code tree & commit via GitHubIntegrationService
            val pushSummary = when (
                val pushRes = service.pushCodeDirectory(
                    rawToken = cleanToken,
                    owner = owner,
                    repoName = repoInfo.name,
                    branch = repoInfo.defaultBranch,
                    entries = entries,
                    onProgress = { progress, text -> updateProgress(progress, text) }
                )
            ) {
                is ServiceCallResult.Success -> pushRes.data
                is ServiceCallResult.AuthExpired -> {
                    handle401DuringPush()
                    return GitHubPushResult.AuthError(pushRes.message, invalidTokenGuideSteps())
                }
                is ServiceCallResult.HttpFailure -> return failPush(pushRes.message)
                is ServiceCallResult.NetworkFailure -> return failPush(pushRes.message)
            }

            // Step 5: Trigger GitHub Actions workflow dispatch explicitly
            updateProgress(0.97f, "Đang kích hoạt GitHub Actions biên dịch .APK...")
            val workflowFile = pushSummary.workflowFilePath ?: ".github/workflows/${GitHubIntegrationService.DEFAULT_WORKFLOW_FILE}"
            val dispatchSummary = when (
                val dispatchRes = service.triggerApkWorkflowBuild(
                    rawToken = cleanToken,
                    owner = owner,
                    repoName = repoInfo.name,
                    workflowFileName = workflowFile,
                    ref = repoInfo.defaultBranch
                )
            ) {
                is ServiceCallResult.Success -> dispatchRes.data
                is ServiceCallResult.AuthExpired -> {
                    handle401DuringPush()
                    return GitHubPushResult.AuthError(dispatchRes.message, invalidTokenGuideSteps())
                }
                is ServiceCallResult.HttpFailure,
                is ServiceCallResult.NetworkFailure -> null
            }

            val repoUrl = repoInfo.htmlUrl.ifBlank { "https://github.com/$owner/${repoInfo.name}" }
            val actionsUrl = dispatchSummary?.latestRunUrl
                ?: dispatchSummary?.actionsUrl
                ?: "$repoUrl/actions"

            val success = GitHubPushResult.Success(
                repoFullName = repoInfo.fullName,
                repoUrl = repoUrl,
                actionsUrl = actionsUrl,
                uploadedFilesCount = pushSummary.uploadedFilesCount,
                workflowIncluded = pushSummary.workflowFilePath != null,
                workflowDispatched = dispatchSummary?.dispatchedExplicitly == true
            )

            _state.value = _state.value.copy(
                isPushing = false,
                pushProgress = 1f,
                pushStatusText = "Hoàn tất! Đã đẩy ${pushSummary.uploadedFilesCount} tệp và kích hoạt build .APK trên GitHub Actions.",
                lastPushSuccess = success,
                lastPushError = null
            )
            success
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val safe = redactToken(
                "Lỗi không mong muốn khi đẩy mã nguồn: ${e.localizedMessage ?: "Thử lại"}",
                cleanToken
            )
            failPush(safe)
        }
    }

    /**
     * Triggers an existing GitHub Actions workflow on demand for a given repository
     * using the verified (or newly entered) personal access token.
     */
    suspend fun triggerApkBuildWorkflowOnly(
        rawToken: String,
        rawRepoName: String,
        workflowFileName: String = GitHubIntegrationService.DEFAULT_WORKFLOW_FILE,
        branch: String = "main"
    ): GitHubPushResult {
        val sanitizedRequested = sanitizeRepoName(rawRepoName)
        if (sanitizedRequested.isBlank()) {
            return failPush("Tên kho lưu trữ không hợp lệ.")
        }

        val tokenInput = rawToken.ifBlank { storage.getToken() }
        val validation = validateAndSaveToken(tokenInput)
        val valid = when (validation) {
            is TokenValidationResult.Valid -> validation
            is TokenValidationResult.InvalidOrExpired ->
                return GitHubPushResult.AuthError(validation.message, validation.guideSteps)
            is TokenValidationResult.NetworkFailure ->
                return failPush(validation.message)
        }

        val pinned = storage.getPinnedRepoName()
        val repoName = if (_state.value.singleDefaultRepoMode && pinned.isNotBlank()) {
            pinned
        } else {
            sanitizedRequested
        }

        _state.value = _state.value.copy(
            isPushing = true,
            pushProgress = 0.6f,
            pushStatusText = "Đang kích hoạt GitHub Actions build .APK...",
            lastPushError = null
        )

        return when (
            val res = service.triggerApkWorkflowBuild(
                rawToken = valid.sanitizedToken,
                owner = valid.user.login,
                repoName = repoName,
                workflowFileName = workflowFileName,
                ref = branch
            )
        ) {
            is ServiceCallResult.Success -> {
                val repoUrl = "https://github.com/${valid.user.login}/$repoName"
                val actionsUrl = res.data.latestRunUrl ?: res.data.actionsUrl
                val success = GitHubPushResult.Success(
                    repoFullName = "${valid.user.login}/$repoName",
                    repoUrl = repoUrl,
                    actionsUrl = actionsUrl,
                    uploadedFilesCount = 0,
                    workflowIncluded = true,
                    workflowDispatched = res.data.dispatchedExplicitly
                )
                _state.value = _state.value.copy(
                    isPushing = false,
                    pushProgress = 1f,
                    pushStatusText = "Đã gửi lệnh kích hoạt GitHub Actions build .APK!",
                    lastPushSuccess = success,
                    lastPushError = null
                )
                success
            }
            is ServiceCallResult.AuthExpired -> {
                handle401DuringPush()
                GitHubPushResult.AuthError(res.message, invalidTokenGuideSteps())
            }
            is ServiceCallResult.HttpFailure -> failPush(res.message)
            is ServiceCallResult.NetworkFailure -> failPush(res.message)
        }
    }

    private fun failPush(message: String): GitHubPushResult.Failure {
        _state.value = _state.value.copy(
            isPushing = false,
            pushProgress = 0f,
            pushStatusText = "",
            lastPushError = message
        )
        return GitHubPushResult.Failure(message)
    }

    private fun handle401DuringPush() {
        storage.clearToken()
        val msg = "Phiên GitHub Token đã hết hạn hoặc bị thu hồi (401). Token và khóa Repo mặc định đã được tự động xóa — vui lòng tạo lại Token mới."
        _state.value = _state.value.copy(
            verifiedToken = "",
            verifiedUser = null,
            pinnedRepoName = "",
            savedRepoName = GitHubExtensionState.DEFAULT_REPO_NAME,
            isPushing = false,
            pushProgress = 0f,
            pushStatusText = "",
            validationNotice = msg,
            validationIsError = true,
            validationGuideSteps = invalidTokenGuideSteps(),
            lastPushError = msg
        )
    }

    private fun updateProgress(progress: Float, text: String) {
        _state.value = _state.value.copy(
            pushProgress = progress.coerceIn(0f, 1f),
            pushStatusText = text
        )
    }

    private fun collectProjectFiles(rootDir: File): List<SourceCodeEntry> {
        val results = mutableListOf<SourceCodeEntry>()
        val rootPath = rootDir.canonicalPath
        val ignoredDirs = setOf(".git", ".gradle", "build", ".idea", ".cxx", "node_modules", "__pycache__", ".dart_tool")
        val maxFileSizeBytes = 8L * 1024L * 1024L // 8 MB safety ceiling per mobile API upload

        fun walk(dir: File) {
            if (results.size >= 800) return
            val children = dir.listFiles()?.sortedBy { it.name } ?: return
            for (child in children) {
                if (child.isDirectory) {
                    if (child.name in ignoredDirs) continue
                    walk(child)
                } else if (child.isFile && child.canRead()) {
                    if (child.length() > maxFileSizeBytes) continue
                    val canonical = child.canonicalPath
                    if (!canonical.startsWith(rootPath)) continue
                    val rel = canonical.removePrefix(rootPath)
                        .trimStart(File.separatorChar)
                        .replace(File.separatorChar, '/')
                    if (rel.isBlank()) continue
                    val isExec = child.name == "gradlew" || child.extension.equals("sh", ignoreCase = true)
                    results.add(
                        SourceCodeEntry(
                            relativePath = rel,
                            bytes = child.readBytes(),
                            executable = isExec
                        )
                    )
                    if (results.size >= 800) break
                }
            }
        }

        walk(rootDir)
        return results
    }

    private fun collectEntriesFromZip(zipFile: File): List<SourceCodeEntry> {
        val rawEntries = mutableListOf<SourceCodeEntry>()
        val ignoredSegments = setOf(".git", ".gradle", "build", ".idea", ".cxx", "node_modules", "__pycache__", ".dart_tool", "__MACOSX")
        val maxFileSizeBytes = 8L * 1024L * 1024L

        ZipInputStream(BufferedInputStream(FileInputStream(zipFile))).use { zis ->
            val buffer = ByteArray(16 * 1024)
            var entry = zis.nextEntry
            while (entry != null && rawEntries.size < 800) {
                if (!entry.isDirectory) {
                    val normalizedPath = entry.name
                        .replace('\\', '/')
                        .trimStart('/')
                    val segments = normalizedPath.split('/').filter { it.isNotBlank() }
                    val hasIgnoredDir = segments.dropLast(1).any { it in ignoredSegments }
                    if (segments.isNotEmpty() && !hasIgnoredDir && !normalizedPath.contains("..")) {
                        val out = java.io.ByteArrayOutputStream()
                        var total = 0L
                        var exceeded = false
                        while (true) {
                            val read = zis.read(buffer)
                            if (read <= 0) break
                            total += read
                            if (total > maxFileSizeBytes) {
                                exceeded = true
                                break
                            }
                            out.write(buffer, 0, read)
                        }
                        if (!exceeded) {
                            val cleanRel = segments.joinToString("/")
                            val fileName = segments.last()
                            val isExec = fileName == "gradlew" || fileName.endsWith(".sh", ignoreCase = true)
                            rawEntries.add(
                                SourceCodeEntry(
                                    relativePath = cleanRel,
                                    bytes = out.toByteArray(),
                                    executable = isExec
                                )
                            )
                        }
                    }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }

        // Unwrap redundant single top-level directory (e.g. "my-project-main/app/..." -> "app/...")
        if (rawEntries.isNotEmpty()) {
            val topSegments = rawEntries.mapNotNull { it.relativePath.substringBefore('/', missingDelimiterValue = "").takeIf { s -> s.isNotBlank() } }
            if (topSegments.size == rawEntries.size) {
                val commonRoot = topSegments.first()
                if (commonRoot != ".github" && topSegments.all { it == commonRoot }) {
                    val prefix = "$commonRoot/"
                    return rawEntries.map { it.copy(relativePath = it.relativePath.removePrefix(prefix)) }
                }
            }
        }
        return rawEntries
    }

    companion object {
        const val GITHUB_SIGN_IN_URL = "https://github.com/login"
        const val GITHUB_TOKEN_CREATE_URL =
            "https://github.com/settings/tokens/new?scopes=repo,workflow,write:packages,admin:repo_hook,user&description=FileManagerPro-APK-Builder"

        private val PREFIX_REGEX = Regex(
            pattern = "^(?:authorization\\s*:\\s*|bearer\\s+|token\\s+|oauth\\s+|git\\s+)+",
            options = setOf(RegexOption.IGNORE_CASE)
        )

        private val KNOWN_TOKEN_PATTERN = Regex(
            pattern = "(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{12,}"
        )

        /**
         * Strips zero-width / BOM / control characters, quotes, whitespace/newlines,
         * and pasted prefixes such as "Bearer " or "token " from user-supplied tokens.
         */
        fun sanitizeToken(raw: String): String {
            if (raw.isEmpty()) return ""
            val strippedInvisible = buildString(raw.length) {
                for (ch in raw) {
                    val type = Character.getType(ch)
                    val isInvisible = type == Character.FORMAT.toInt() ||
                        type == Character.CONTROL.toInt() ||
                        ch == '\u200B' || ch == '\u200C' || ch == '\u200D' ||
                        ch == '\u2060' || ch == '\uFEFF'
                    if (!isInvisible) append(ch)
                }
            }.trim()

            var cleaned = strippedInvisible
                .trim('"', '\'', '`', ' ', '\t', '\r', '\n')

            while (PREFIX_REGEX.containsMatchIn(cleaned)) {
                cleaned = PREFIX_REGEX.replaceFirst(cleaned, "").trim()
            }

            cleaned = cleaned
                .trim('"', '\'', '`')
                .replace(Regex("\\s+"), "")

            return cleaned
        }

        fun sanitizeRepoName(raw: String): String {
            return raw.trim()
                .replace(' ', '-')
                .replace(Regex("[^A-Za-z0-9._-]"), "-")
                .trim('-')
                .take(80)
        }

        /**
         * Guarantees tokens never leak into error strings, UI messages, or logs.
         */
        fun redactToken(text: String, explicitToken: String? = null): String {
            var out = KNOWN_TOKEN_PATTERN.replace(text, "[REDACTED_TOKEN]")
            val clean = explicitToken?.let(::sanitizeToken).orEmpty()
            if (clean.length >= 6) {
                out = out.replace(clean, "[REDACTED_TOKEN]")
            }
            if (!explicitToken.isNullOrBlank() && explicitToken.trim().length >= 6) {
                out = out.replace(explicitToken.trim(), "[REDACTED_TOKEN]")
            }
            return out
        }

        fun invalidTokenGuideSteps(): List<String> = listOf(
            "1. Nhấn \"Lấy Token (đã chọn repo + workflow)\" để mở trang tạo mã trên GitHub.",
            "2. Đăng nhập tài khoản GitHub liên kết Google (nếu được hỏi) và bấm \"Generate token\".",
            "3. Sao chép đầy đủ chuỗi đầu ghp_... hoặc github_pat_... (không chứa dấu cách/ngoặc kép).",
            "4. Dán lại vào ô Mã truy cập cá nhân GitHub và bấm Kiểm tra hoặc 🚀 Đẩy Lên GitHub & Tạo APK."
        )

        val DEFAULT_ANDROID_APK_WORKFLOW: String = """
            name: Build Android APK
            on:
              push:
                branches: [ main, master ]
              workflow_dispatch:

            permissions:
              contents: write
              actions: write

            jobs:
              build-apk:
                runs-on: ubuntu-latest
                steps:
                  - name: Checkout source
                    uses: actions/checkout@v4

                  - name: Set up JDK 17
                    uses: actions/setup-java@v4
                    with:
                      distribution: temurin
                      java-version: '17'

                  - name: Set up Node.js (if Capacitor/Web project)
                    if: hashFiles('package.json') != ''
                    uses: actions/setup-node@v4
                    with:
                      node-version: '20'

                  - name: Install & Sync Capacitor Android (if applicable)
                    if: hashFiles('package.json') != '' && hashFiles('capacitor.config.*') != ''
                    run: |
                      npm install
                      npm run build || true
                      npx cap sync android || true

                  - name: Restore debug.keystore if bundled
                    run: |
                      if [ ! -f debug.keystore ] && [ -f debug.keystore.base64 ]; then
                        echo "Decoding debug.keystore.base64..."
                        base64 -d debug.keystore.base64 > debug.keystore
                      elif [ ! -f debug.keystore ] && [ -f app/debug.keystore.base64 ]; then
                        echo "Decoding app/debug.keystore.base64..."
                        base64 -d app/debug.keystore.base64 > debug.keystore
                      fi
                      if [ ! -f debug.keystore ]; then
                        echo "::warning::debug.keystore(.base64) not found; Gradle will generate a temporary debug keystore if needed."
                      else
                        keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android | grep -E "SHA1:|SHA256:" || true
                      fi

                  - name: Grant execute permission for gradlew
                    if: hashFiles('gradlew', 'android/gradlew') != ''
                    run: |
                      [ -f gradlew ] && chmod +x gradlew || true
                      [ -f android/gradlew ] && chmod +x android/gradlew || true

                  - name: Build Debug APK (Root Gradle)
                    if: hashFiles('gradlew') != ''
                    env:
                      ORG_GRADLE_OPTS: -Djava.awt.headless=true
                    run: ./gradlew assembleDebug --no-daemon

                  - name: Build Debug APK (Capacitor Android Subdir)
                    if: hashFiles('gradlew') == '' && hashFiles('android/gradlew') != ''
                    working-directory: android
                    env:
                      ORG_GRADLE_OPTS: -Djava.awt.headless=true
                    run: ./gradlew assembleDebug --no-daemon

                  - name: Setup Gradle (Fallback when wrapper omitted)
                    if: hashFiles('gradlew', 'android/gradlew') == '' && hashFiles('build.gradle*', 'android/build.gradle*') != ''
                    uses: gradle/actions/setup-gradle@v4

                  - name: Build Debug APK via System Gradle
                    if: hashFiles('gradlew', 'android/gradlew') == '' && hashFiles('build.gradle*', 'android/build.gradle*') != ''
                    env:
                      ORG_GRADLE_OPTS: -Djava.awt.headless=true
                    run: |
                      if [ -f build.gradle ] || [ -f build.gradle.kts ]; then
                        gradle assembleDebug --no-daemon
                      elif [ -d android ]; then
                        cd android && gradle assembleDebug --no-daemon
                      fi

                  - name: Upload APK Artifact
                    uses: actions/upload-artifact@v4
                    if: always()
                    with:
                      name: app-debug-apk
                      path: '**/*.apk'
        """.trimIndent() + "\n"
    }
}
