package com.example.filemanager.extensions

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import com.example.R
import com.google.android.gms.tasks.Task
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.OAuthProvider
import com.google.firebase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.security.MessageDigest
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class GoogleAccountProfile(
    val uid: String,
    val displayName: String,
    val email: String,
    val photoUrl: String? = null
)

sealed interface GoogleAuthUiState {
    data object SignedOut : GoogleAuthUiState
    data class Loading(val message: String = "Đang xử lý...") : GoogleAuthUiState
    data class SignedIn(val profile: GoogleAccountProfile) : GoogleAuthUiState
    data class Error(
        val message: String,
        val previousProfile: GoogleAccountProfile? = null,
        val diagnosticSha1: String? = null,
        val expectedSha1: String? = null
    ) : GoogleAuthUiState
}

/**
 * Optional Google Sign-In Portal powered by Firebase Authentication + Jetpack Credential Manager
 * (`GetSignInWithGoogleOption`), with separate `GetGoogleIdOption` and Firebase Browser OAuth
 * (`OAuthProvider`) fallbacks so users can sign in, sign out, and switch accounts cleanly.
 * Offline File Manager functionality remains 100% available whether signed in or signed out.
 */
object GoogleAuthManager {
    private const val TAG = "GoogleAuthPortal"
    const val REGISTERED_DEBUG_SHA1 = "18:2E:77:D7:F3:68:96:1F:98:37:07:E4:A4:8C:32:48:33:00:90:26"

    private val managerScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val auth: FirebaseAuth by lazy { Firebase.auth }

    private val _authState = MutableStateFlow<GoogleAuthUiState>(
        auth.currentUser?.toProfile()?.let { GoogleAuthUiState.SignedIn(it) } ?: GoogleAuthUiState.SignedOut
    )
    val authState: StateFlow<GoogleAuthUiState> = _authState.asStateFlow()

    private val authListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
        val current = firebaseAuth.currentUser?.toProfile()
        val existingState = _authState.value
        if (existingState !is GoogleAuthUiState.Loading) {
            _authState.value = if (current != null) {
                GoogleAuthUiState.SignedIn(current)
            } else {
                GoogleAuthUiState.SignedOut
            }
        }
    }

    init {
        try {
            auth.addAuthStateListener(authListener)
            // Recover any pending browser OAuth sign-in result if Activity was recreated
            auth.pendingAuthResult?.addOnSuccessListener { res ->
                val profile = (res.user ?: auth.currentUser)?.toProfile()
                if (profile != null) {
                    _authState.value = GoogleAuthUiState.SignedIn(profile)
                }
            }?.addOnFailureListener { exc ->
                Log.w(TAG, "Pending OAuth result failed: ${exc.message}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "FirebaseAuth listener init notice: ${e.message}")
        }
    }

    fun signInWithGoogle(context: Context) {
        val activity = context.findActivity()
        if (activity == null) {
            _authState.value = GoogleAuthUiState.Error(
                message = "Không thể mở hộp thoại đăng nhập từ ngữ cảnh hiện tại.",
                previousProfile = auth.currentUser?.toProfile()
            )
            return
        }

        val serverClientId = try {
            context.getString(R.string.default_web_client_id)
        } catch (_: Exception) {
            ""
        }
        if (serverClientId.isBlank() || serverClientId.contains("dummy", ignoreCase = true)) {
            signInWithGoogleWebOAuth(activity)
            return
        }

        val previousProfile = auth.currentUser?.toProfile()
        _authState.value = GoogleAuthUiState.Loading("Đang mở chọn tài khoản Google...")

        managerScope.launch {
            try {
                // Pass Activity directly (CredentialManager requires an Activity context for Play Services UI)
                val credentialManager = CredentialManager.create(activity)
                val installedSha1 = getInstalledApkSha1(activity)
                val isCertMismatch = installedSha1 != null && !installedSha1.equals(REGISTERED_DEBUG_SHA1, ignoreCase = true)

                // Step 1: Official interactive GetSignInWithGoogleOption (1 option per request)
                val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = serverClientId).build()
                val primaryRequest = GetCredentialRequest.Builder()
                    .addCredentialOption(signInOption)
                    .build()

                val response = try {
                    credentialManager.getCredential(activity, primaryRequest)
                } catch (e: GetCredentialCancellationException) {
                    Log.w(TAG, "Google Sign-In flow cancelled or dismissed: ${e.message}", e)
                    if (isCertMismatch || isConfigOrCertErrorMessage(e.message.orEmpty())) {
                        // Automatically fall back to browser OAuth when Credential Manager rejects cert/config
                        launchFirebaseGoogleWebOAuth(activity, previousProfile)
                    } else {
                        _authState.value = GoogleAuthUiState.Error(
                            message = "Đã đóng hộp thoại chọn tài khoản Google. Hãy nhấn thử lại hoặc chọn đăng nhập qua trình duyệt.",
                            previousProfile = previousProfile
                        )
                    }
                    return@launch
                } catch (primaryErr: GetCredentialException) {
                    Log.w(TAG, "Primary GetSignInWithGoogleOption failed (${primaryErr::class.simpleName}): ${primaryErr.message}")
                    if (isCertMismatch || isConfigOrCertErrorMessage(primaryErr.message.orEmpty())) {
                        launchFirebaseGoogleWebOAuth(activity, previousProfile)
                        return@launch
                    }
                    // Step 2: Try GetGoogleIdOption in a separate single-option request before Web OAuth
                    try {
                        val fallbackOption = GetGoogleIdOption.Builder()
                            .setFilterByAuthorizedAccounts(false)
                            .setServerClientId(serverClientId)
                            .setAutoSelectEnabled(false)
                            .build()
                        val fallbackRequest = GetCredentialRequest.Builder()
                            .addCredentialOption(fallbackOption)
                            .build()
                        credentialManager.getCredential(activity, fallbackRequest)
                    } catch (cancelErr: GetCredentialCancellationException) {
                        Log.w(TAG, "Fallback GetGoogleIdOption cancelled or dismissed: ${cancelErr.message}", cancelErr)
                        if (isCertMismatch || isConfigOrCertErrorMessage(cancelErr.message.orEmpty())) {
                            launchFirebaseGoogleWebOAuth(activity, previousProfile)
                        } else {
                            _authState.value = GoogleAuthUiState.Error(
                                message = "Đã hủy chọn tài khoản Google. Bạn có thể thử lại hoặc dùng \"Đăng nhập Google qua trình duyệt\".",
                                previousProfile = previousProfile
                            )
                        }
                        return@launch
                    } catch (fallbackErr: Exception) {
                        Log.w(TAG, "Credential Manager fallback failed (${fallbackErr::class.simpleName}): ${fallbackErr.message}; launching Web OAuth")
                        launchFirebaseGoogleWebOAuth(activity, previousProfile)
                        return@launch
                    }
                }

                val cred = response.credential
                if (cred is CustomCredential && cred.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val googleToken = GoogleIdTokenCredential.createFrom(cred.data).idToken
                    val firebaseCred = GoogleAuthProvider.getCredential(googleToken, null)
                    val authResult = auth.signInWithCredential(firebaseCred).awaitTask()
                    val profile = (authResult.user ?: auth.currentUser)?.toProfile()
                    _authState.value = if (profile != null) {
                        GoogleAuthUiState.SignedIn(profile)
                    } else {
                        GoogleAuthUiState.SignedOut
                    }
                } else {
                    Log.w(TAG, "Unexpected credential type: ${cred::class.java.name}")
                    launchFirebaseGoogleWebOAuth(activity, previousProfile)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: NoCredentialException) {
                Log.w(TAG, "No Google credential on device: ${e.message}", e)
                launchFirebaseGoogleWebOAuth(activity, previousProfile)
            } catch (e: GetCredentialUnsupportedException) {
                Log.w(TAG, "Credential Manager unsupported: ${e.message}", e)
                launchFirebaseGoogleWebOAuth(activity, previousProfile)
            } catch (e: GetCredentialProviderConfigurationException) {
                Log.w(TAG, "Credential Provider configuration notice: ${e.message}", e)
                launchFirebaseGoogleWebOAuth(activity, previousProfile)
            } catch (e: Exception) {
                Log.w(TAG, "Google Sign-In failed: ${e.message}", e)
                _authState.value = buildDiagnosticError(
                    rawMessage = e.localizedMessage.orEmpty(),
                    context = activity,
                    previousProfile = previousProfile
                )
            }
        }
    }

    /**
     * Opens Google OAuth login directly via Chrome Custom Tab / system browser through Firebase Auth.
     */
    fun signInWithGoogleWebOAuth(context: Context) {
        val activity = context.findActivity()
        if (activity == null) {
            _authState.value = GoogleAuthUiState.Error(
                message = "Không thể mở trình duyệt đăng nhập từ ngữ cảnh hiện tại.",
                previousProfile = auth.currentUser?.toProfile()
            )
            return
        }
        val previousProfile = auth.currentUser?.toProfile()
        _authState.value = GoogleAuthUiState.Loading("Đang mở trang đăng nhập Google an toàn...")
        managerScope.launch {
            launchFirebaseGoogleWebOAuth(activity, previousProfile)
        }
    }

    private suspend fun launchFirebaseGoogleWebOAuth(
        activity: Activity,
        previousProfile: GoogleAccountProfile?
    ) {
        try {
            val existingUser = auth.currentUser?.toProfile()
            if (existingUser != null && previousProfile == null) {
                _authState.value = GoogleAuthUiState.SignedIn(existingUser)
                return
            }

            _authState.value = GoogleAuthUiState.Loading("Đang kết nối cổng đăng nhập Google qua trình duyệt...")
            val provider = OAuthProvider.newBuilder("google.com")
                .setScopes(listOf("email", "profile"))
                .addCustomParameter("prompt", "select_account")
                .build()

            val result = auth.startActivityForSignInWithProvider(activity, provider).awaitTask()

            val profile = (result.user ?: auth.currentUser)?.toProfile()
            _authState.value = if (profile != null) {
                GoogleAuthUiState.SignedIn(profile)
            } else {
                GoogleAuthUiState.SignedOut
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Web OAuth sign-in notice: ${e.message}", e)
            _authState.value = buildDiagnosticError(
                rawMessage = e.localizedMessage ?: e.message.orEmpty(),
                context = activity,
                previousProfile = previousProfile,
                fromWebOAuth = true
            )
        }
    }

    private fun isConfigOrCertErrorMessage(rawMessage: String): Boolean {
        return rawMessage.contains("28444") ||
            rawMessage.contains("16:") ||
            rawMessage.contains("developer console", ignoreCase = true) ||
            rawMessage.contains("caller", ignoreCase = true) ||
            rawMessage.contains("certificate", ignoreCase = true) ||
            rawMessage.contains("CERT_HASH", ignoreCase = true) ||
            rawMessage.contains("not authorized", ignoreCase = true) ||
            rawMessage.contains("blocked", ignoreCase = true)
    }

    private fun buildDiagnosticError(
        rawMessage: String,
        context: Context,
        previousProfile: GoogleAccountProfile?,
        fromWebOAuth: Boolean = false
    ): GoogleAuthUiState.Error {
        val installedSha1 = getInstalledApkSha1(context)
        val isCertMismatch = installedSha1 != null && !installedSha1.equals(REGISTERED_DEBUG_SHA1, ignoreCase = true)
        val mentionsCertHash = isConfigOrCertErrorMessage(rawMessage)
        val isUserCancel = (rawMessage.contains("canceled", ignoreCase = true) ||
            rawMessage.contains("cancelled", ignoreCase = true) ||
            rawMessage.contains("web operation was canceled", ignoreCase = true)) && !mentionsCertHash

        return when {
            isUserCancel ->
                GoogleAuthUiState.Error(
                    message = "Bạn đã đóng cửa sổ đăng nhập Google.",
                    previousProfile = previousProfile
                )
            rawMessage.contains("network", ignoreCase = true) ->
                GoogleAuthUiState.Error(
                    message = "Không có kết nối Internet để đăng nhập Google.",
                    previousProfile = previousProfile
                )
            isCertMismatch -> {
                val detail = rawMessage.takeIf { it.isNotBlank() && !it.equals("certificate hash mismatch", ignoreCase = true) }
                val prefix = if (fromWebOAuth && detail != null) {
                    "Đăng nhập trình duyệt báo lỗi ($detail). "
                } else {
                    ""
                }
                GoogleAuthUiState.Error(
                    message = "${prefix}Chữ ký APK đang cài (SHA-1: $installedSha1) chưa khớp với chữ ký Firebase đã đăng ký ($REGISTERED_DEBUG_SHA1). Hãy dùng bản APK build từ Tab \"Mã nguồn -> Đẩy lên GitHub & Tạo APK\" hoặc thêm SHA-1 đang cài vào Firebase Console.",
                    previousProfile = previousProfile,
                    diagnosticSha1 = installedSha1,
                    expectedSha1 = REGISTERED_DEBUG_SHA1
                )
            }
            mentionsCertHash ->
                GoogleAuthUiState.Error(
                    message = "Lỗi xác thực chứng chỉ gói APK (${installedSha1 ?: "không xác định"}): ${rawMessage.ifBlank { "Vui lòng cập nhật bản cài đặt chuẩn Firebase." }}",
                    previousProfile = previousProfile,
                    diagnosticSha1 = installedSha1,
                    expectedSha1 = REGISTERED_DEBUG_SHA1
                )
            else ->
                GoogleAuthUiState.Error(
                    message = "Không thể hoàn tất đăng nhập Google: ${rawMessage.ifBlank { "Vui lòng kiểm tra kết nối mạng / trình duyệt mặc định và thử lại." }}",
                    previousProfile = previousProfile
                )
        }
    }

    fun getInstalledApkSha1(context: Context): String? {
        return try {
            val pm = context.packageManager
            val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                val signingInfo = info.signingInfo ?: return null
                if (signingInfo.hasMultipleSigners()) signingInfo.apkContentsSigners else signingInfo.signingCertificateHistory
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
            }
            val certBytes = signatures?.firstOrNull()?.toByteArray() ?: return null
            val digest = MessageDigest.getInstance("SHA-1").digest(certBytes)
            digest.joinToString(":") { "%02X".format(it) }
        } catch (_: Exception) {
            null
        }
    }

    fun signOut(context: Context, onComplete: (() -> Unit)? = null) {
        _authState.value = GoogleAuthUiState.Loading("Đang đăng xuất tài khoản...")
        managerScope.launch {
            withContext(NonCancellable) {
                try {
                    val credentialManager = CredentialManager.create(context.applicationContext)
                    credentialManager.clearCredentialState(ClearCredentialStateRequest())
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to clear credential state: ${e.message}")
                } finally {
                    try {
                        auth.signOut()
                    } catch (e: Exception) {
                        Log.w(TAG, "Firebase signOut notice: ${e.message}")
                    }
                    _authState.value = GoogleAuthUiState.SignedOut
                    onComplete?.invoke()
                }
            }
        }
    }

    fun switchAccount(context: Context) {
        signOut(context) {
            managerScope.launch {
                signInWithGoogle(context)
            }
        }
    }

    fun dismissError() {
        val current = auth.currentUser?.toProfile()
        _authState.value = if (current != null) {
            GoogleAuthUiState.SignedIn(current)
        } else {
            GoogleAuthUiState.SignedOut
        }
    }

    private fun FirebaseUser.toProfile(): GoogleAccountProfile {
        val fallbackName = email?.substringBefore("@")?.takeIf { it.isNotBlank() } ?: "Người dùng Google"
        return GoogleAccountProfile(
            uid = uid,
            displayName = displayName?.takeIf { it.isNotBlank() } ?: fallbackName,
            email = email.orEmpty(),
            photoUrl = photoUrl?.toString()
        )
    }

    private tailrec fun Context.findActivity(): Activity? = when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

    private suspend fun <T> Task<T>.awaitTask(): T = suspendCancellableCoroutine { cont ->
        addOnSuccessListener { result ->
            if (cont.isActive) cont.resume(result)
        }
        addOnFailureListener { exc ->
            if (cont.isActive) cont.resumeWithException(exc)
        }
        addOnCanceledListener {
            cont.cancel()
        }
    }
}
