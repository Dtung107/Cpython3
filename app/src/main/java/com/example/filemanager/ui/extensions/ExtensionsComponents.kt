package com.example.filemanager.ui.extensions

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Launch
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.example.filemanager.extensions.GitHubApkPushManager
import com.example.filemanager.extensions.GitHubExtensionState
import com.example.filemanager.extensions.GoogleAuthManager
import com.example.filemanager.extensions.GoogleAuthUiState
import com.example.filemanager.model.FileItem
import com.example.filemanager.ui.archive.FolderPickerDialog
import com.example.ui.theme.*
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

private val VioletAccent = VioletGlow
private val MagentaAccent = VioletGlow
private val PanelDeepBg = ObsidianDeep
private val PanelCardBg = CharcoalSurface
private val PanelCalloutBg = CharcoalSurfaceVariant

fun openExternalUrl(context: Context, url: String) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (_: Exception) {
    }
}

/**
 * Optional Google Account Portal card for HomeScreen Extensions and SettingsScreen.
 * Users can sign in, sign out, and switch to another Google account at any time without
 * gating offline file management features.
 */
@Composable
fun GoogleAccountPortalCard(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val authState by GoogleAuthManager.authState.collectAsState()

    val currentProfile = when (val s = authState) {
        is GoogleAuthUiState.SignedIn -> s.profile
        is GoogleAuthUiState.Error -> s.previousProfile
        else -> null
    }
    val clipboardManager = LocalClipboardManager.current
    val isLoading = authState is GoogleAuthUiState.Loading
    val loadingMessage = (authState as? GoogleAuthUiState.Loading)?.message
    val errorState = authState as? GoogleAuthUiState.Error
    val errorMessage = errorState?.message
    val diagnosticSha1 = errorState?.diagnosticSha1
    val expectedSha1 = errorState?.expectedSha1

    Surface(
        color = CharcoalSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(
            width = 1.dp,
            color = if (currentProfile != null) ColorSuccessGreen.copy(alpha = 0.35f) else CharcoalSurfaceHighlight
        ),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = ElectricBlue.copy(alpha = 0.16f),
                        modifier = Modifier.size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.AccountCircle,
                                contentDescription = "Tài khoản Google",
                                tint = ElectricBlue,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Cổng đăng nhập tài khoản Google",
                            color = TextPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Tùy chọn • Quản lý tệp offline vẫn hoạt động đầy đủ",
                            color = TextMuted,
                            fontSize = 11.sp
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (currentProfile != null) ColorSuccessGreen.copy(alpha = 0.16f) else CharcoalSurfaceVariant
                ) {
                    Text(
                        text = if (currentProfile != null) "Đã kết nối" else "Tùy chọn",
                        color = if (currentProfile != null) ColorSuccessGreen else TextSecondary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            if (!errorMessage.isNullOrBlank()) {
                Surface(
                    color = ColorErrorRed.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, ColorErrorRed.copy(alpha = 0.35f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = "Thông báo",
                                tint = ColorErrorRed,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = errorMessage,
                                color = TextPrimary,
                                fontSize = 12.sp,
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = { GoogleAuthManager.dismissError() },
                                modifier = Modifier.size(48.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Đóng thông báo",
                                    tint = TextSecondary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        if (!diagnosticSha1.isNullOrBlank()) {
                            OutlinedButton(
                                onClick = {
                                    clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(diagnosticSha1))
                                },
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.6f)),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.ContentCopy,
                                    contentDescription = "Sao chép SHA-1",
                                    tint = ColorWarningAmber,
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Sao chép SHA-1: $diagnosticSha1",
                                    color = ColorWarningAmber,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        if (!expectedSha1.isNullOrBlank()) {
                            Text(
                                text = "Chữ ký chuẩn Firebase: $expectedSha1 (đã đóng gói sẵn trong Tab Mã nguồn -> Đẩy lên GitHub & Tạo APK).",
                                color = CyanAccent,
                                fontSize = 11.sp,
                                lineHeight = 15.sp
                            )
                        }
                    }
                }
            }

            if (isLoading) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = ElectricBlue,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = loadingMessage ?: "Đang xử lý...",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }
            } else if (currentProfile == null) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { GoogleAuthManager.signInWithGoogle(context) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ElectricBlue,
                            contentColor = Color.White
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("google_sign_in_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Login,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Đăng nhập tài khoản Google",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 13.sp
                        )
                    }

                    OutlinedButton(
                        onClick = { GoogleAuthManager.signInWithGoogleWebOAuth(context) },
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("google_web_oauth_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Launch,
                            contentDescription = "Đăng nhập Google qua trình duyệt",
                            tint = CyanAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Đăng nhập Google qua trình duyệt (Dự phòng)",
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }
            } else {
                Surface(
                    color = CharcoalSurfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(ElectricBlue.copy(alpha = 0.25f)),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!currentProfile.photoUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = currentProfile.photoUrl,
                                    contentDescription = "Ảnh đại diện Google",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Text(
                                    text = currentProfile.displayName.firstOrNull()?.uppercase() ?: "G",
                                    color = ElectricBlue,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = currentProfile.displayName,
                                color = TextPrimary,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 13.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = currentProfile.email.ifBlank { currentProfile.uid },
                                color = TextSecondary,
                                fontSize = 11.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { GoogleAuthManager.switchAccount(context) },
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, ElectricBlue.copy(alpha = 0.6f)),
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .testTag("google_switch_account_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.SwitchAccount,
                            contentDescription = null,
                            tint = CyanAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Chọn tài khoản khác",
                            color = TextPrimary,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    OutlinedButton(
                        onClick = { GoogleAuthManager.signOut(context) },
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, ColorErrorRed.copy(alpha = 0.5f)),
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag("google_sign_out_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = "Đăng xuất Google",
                            tint = ColorErrorRed,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Đăng xuất",
                            color = ColorErrorRed,
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}

/**
 * HomeScreen summary card for the GitHub Token + 1-Tap Push & Auto APK CI/CD extension.
 */
@Composable
fun GitHubExtensionSummaryCard(
    gitHubState: GitHubExtensionState,
    onOpenSettingsAndPushDialog: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val verifiedUser = gitHubState.verifiedUser

    Surface(
        color = CharcoalSurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(
            width = 1.dp,
            color = if (verifiedUser != null) VioletAccent.copy(alpha = 0.55f) else CharcoalSurfaceHighlight
        ),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = VioletAccent.copy(alpha = 0.2f),
                        modifier = Modifier.size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.RocketLaunch,
                                contentDescription = "GitHub CI/CD",
                                tint = MagentaAccent,
                                modifier = Modifier.size(19.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "Đẩy lên GitHub & Tạo .APK",
                            color = TextPrimary,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = if (verifiedUser != null) {
                                "Đã xác thực @${verifiedUser.login} • Repo mặc định: ${gitHubState.effectiveRepoName}"
                            } else {
                                "Tạo GitHub Token đầy đủ quyền & tự động build .apk"
                            },
                            color = if (verifiedUser != null) ColorSuccessGreen else TextMuted,
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = VioletAccent.copy(alpha = 0.18f),
                    border = BorderStroke(1.dp, VioletAccent.copy(alpha = 0.45f))
                ) {
                    Text(
                        text = "CI/CD APK",
                        color = Color(0xFFD0BCFF),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onOpenSettingsAndPushDialog,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        contentColor = Color.White
                    ),
                    contentPadding = PaddingValues(0.dp),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .background(
                            brush = Brush.horizontalGradient(listOf(ElectricBlue, VioletAccent)),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .testTag("github_open_settings_button")
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = null,
                        modifier = Modifier.size(17.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Cài đặt Token & Đẩy GitHub 🚀",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                OutlinedButton(
                    onClick = { openExternalUrl(context, GitHubApkPushManager.GITHUB_TOKEN_CREATE_URL) },
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.6f)),
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.VpnKey,
                        contentDescription = "Tạo mã thông báo GitHub",
                        tint = ColorWarningAmber,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = "Lấy Token",
                        color = ColorWarningAmber,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

/**
 * Complete modal dialog matching the user's reference design for configuring the GitHub
 * Personal Access Token, choosing any project folder on device, auto-creating the repo,
 * pushing 100% source code, and triggering GitHub Actions APK compilation.
 */
@Composable
fun GitHubEnvSettingsDialog(
    pushManager: GitHubApkPushManager,
    defaultDirectory: File,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val state by pushManager.state.collectAsState()

    var tokenInput by remember(state.verifiedToken) { mutableStateOf(state.verifiedToken) }
    var showTokenPlaintext by remember { mutableStateOf(false) }
    var repoNameInput by remember(state.effectiveRepoName) { mutableStateOf(state.effectiveRepoName) }
    var selectedSource by remember(state.savedSourceDirPath) {
        mutableStateOf(
            state.savedSourceDirPath
                .takeIf { it.isNotBlank() }
                ?.let { File(it) }
                ?.takeIf { it.exists() && (it.isDirectory || it.extension.equals("zip", ignoreCase = true)) }
                ?: defaultDirectory
        )
    }
    var isPrivateRepo by remember { mutableStateOf(false) }
    var showFolderPicker by remember { mutableStateOf(false) }

    fun checkStoragePermission(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    var hasStoragePermission by remember { mutableStateOf(checkStoragePermission()) }

    val manageStorageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        hasStoragePermission = checkStoragePermission()
    }

    val legacyStoragePermLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        hasStoragePermission = checkStoragePermission()
    }

    val onApplyChosenSource: (File) -> Unit = { chosen ->
        selectedSource = chosen
        val targetRepo = if (state.singleDefaultRepoMode) {
            state.effectiveRepoName
        } else {
            val baseName = if (chosen.isFile && chosen.extension.equals("zip", ignoreCase = true)) {
                chosen.nameWithoutExtension
            } else {
                chosen.name
            }
            if (repoNameInput.isBlank()) {
                GitHubApkPushManager.sanitizeRepoName(baseName)
                    .ifBlank { GitHubExtensionState.DEFAULT_REPO_NAME }
            } else {
                repoNameInput
            }
        }
        repoNameInput = targetRepo
        pushManager.updateRepoAndFolderPreferences(targetRepo, chosen.absolutePath)
    }

    val systemZipPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            try {
                var displayName = "source_archive.zip"
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) {
                            cursor.getString(idx)?.takeIf { it.isNotBlank() }?.let { displayName = it }
                        }
                    }
                }
                if (!displayName.lowercase().endsWith(".zip")) {
                    displayName = "$displayName.zip"
                }
                val cacheFolder = File(context.cacheDir, "github_zip_imports").apply { mkdirs() }
                val destFile = File(cacheFolder, displayName)
                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
                if (destFile.exists() && destFile.length() > 0L) {
                    onApplyChosenSource(destFile)
                }
            } catch (_: Exception) {
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = PanelDeepBg,
            border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
            modifier = Modifier
                .fillMaxWidth(0.94f)
                .widthIn(max = 560.dp)
                .heightIn(max = 760.dp)
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ColorWarningAmber.copy(alpha = 0.16f),
                            border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.45f)),
                            modifier = Modifier.size(34.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.Settings,
                                    contentDescription = "Cài đặt môi trường",
                                    tint = ColorWarningAmber,
                                    modifier = Modifier.size(19.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Cài Đặt Môi Trường",
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp
                        )
                    }
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Đóng",
                            tint = TextSecondary
                        )
                    }
                }

                HorizontalDivider(color = CharcoalSurfaceHighlight)

                // Scrollable Body
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        color = PanelCardBg,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, VioletAccent.copy(alpha = 0.35f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Card title & CI/CD badge
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.CreateNewFolder,
                                        contentDescription = null,
                                        tint = Color(0xFF90CAF9),
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Đẩy lên GitHub & Tự động tạo file .APK",
                                        color = TextPrimary,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = VioletAccent.copy(alpha = 0.16f),
                                    border = BorderStroke(1.dp, VioletAccent.copy(alpha = 0.4f))
                                ) {
                                    Text(
                                        text = "Gradle +\nCI/CD APK",
                                        color = Color(0xFF9FA8DA),
                                        fontSize = 10.sp,
                                        fontFamily = FontFamily.Monospace,
                                        lineHeight = 13.sp,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp)
                                    )
                                }
                            }

                            // Inner 1-tap helper box
                            Surface(
                                color = PanelCalloutBg,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.PhoneAndroid,
                                                contentDescription = null,
                                                tint = ColorWarningAmber,
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = "Dành cho điện thoại (Tự động 1-Chạm)",
                                                color = ColorWarningAmber,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
                                        }
                                        Surface(
                                            shape = RoundedCornerShape(6.dp),
                                            color = ColorWarningAmber.copy(alpha = 0.14f),
                                            border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.35f))
                                        ) {
                                            Text(
                                                text = "Không cần PC",
                                                color = ColorWarningAmber,
                                                fontSize = 10.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                                            )
                                        }
                                    }

                                    Text(
                                        text = "1. Đăng nhập GitHub rồi tạo mã Token đầy đủ quyền (repo, workflow, write:packages, admin:repo_hook, user — đầu ghp_...).\n2. Dán mã vào ô Mã truy cập cá nhân GitHub và chọn thư mục mã nguồn HOẶC tệp .ZIP — hệ thống sẽ tự tạo repo, đẩy 100% mã nguồn và kích hoạt GitHub Actions biên dịch .APK.",
                                        color = TextSecondary,
                                        fontSize = 12.sp,
                                        lineHeight = 17.sp
                                    )

                                    // Quick links: GitHub Sign-In + Create Token
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        OutlinedButton(
                                            onClick = { openExternalUrl(context, GitHubApkPushManager.GITHUB_SIGN_IN_URL) },
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                            modifier = Modifier.heightIn(min = 40.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.Login,
                                                contentDescription = null,
                                                tint = TextSecondary,
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text("Đăng nhập GitHub", color = TextPrimary, fontSize = 11.sp)
                                        }

                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(6.dp))
                                                .clickable {
                                                    openExternalUrl(context, GitHubApkPushManager.GITHUB_TOKEN_CREATE_URL)
                                                }
                                                .padding(horizontal = 6.dp, vertical = 6.dp)
                                                .weight(1f)
                                        ) {
                                            Text(
                                                text = "Lấy Token (đầy đủ quyền build APK)",
                                                color = ColorWarningAmber,
                                                fontSize = 11.5.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                textDecoration = TextDecoration.Underline,
                                                modifier = Modifier.weight(1f)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Icon(
                                                imageVector = Icons.AutoMirrored.Filled.Launch,
                                                contentDescription = "Mở trang tạo GitHub Token",
                                                tint = ColorWarningAmber,
                                                modifier = Modifier.size(14.dp)
                                            )
                                        }
                                    }

                                    // Token label & masked input
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.Key,
                                            contentDescription = null,
                                            tint = ColorWarningAmber,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Mã truy cập cá nhân GitHub (Personal Access Token):",
                                            color = TextPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium
                                        )
                                    }

                                    OutlinedTextField(
                                        value = tokenInput,
                                        onValueChange = { raw ->
                                            // Strip invisible characters/newlines immediately on input/paste
                                            tokenInput = GitHubApkPushManager.sanitizeToken(raw)
                                            if (state.validationIsError) pushManager.clearNotices()
                                        },
                                        placeholder = {
                                            Text(
                                                "Dán mã bắt đầu bằng ghp_...",
                                                color = TextMuted,
                                                fontSize = 12.sp
                                            )
                                        },
                                        singleLine = true,
                                        visualTransformation = if (showTokenPlaintext) {
                                            VisualTransformation.None
                                        } else {
                                            PasswordVisualTransformation()
                                        },
                                        trailingIcon = {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                IconButton(
                                                    onClick = {
                                                        val pasted = clipboardManager.getText()?.text.orEmpty()
                                                        if (pasted.isNotBlank()) {
                                                            tokenInput = GitHubApkPushManager.sanitizeToken(pasted)
                                                            pushManager.clearNotices()
                                                        }
                                                    },
                                                    modifier = Modifier.size(48.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.ContentPaste,
                                                        contentDescription = "Dán Token từ khay nhớ tạm",
                                                        tint = CyanAccent,
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                }
                                                IconButton(
                                                    onClick = { showTokenPlaintext = !showTokenPlaintext },
                                                    modifier = Modifier.size(48.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = if (showTokenPlaintext) {
                                                            Icons.Default.VisibilityOff
                                                        } else {
                                                            Icons.Default.Visibility
                                                        },
                                                        contentDescription = if (showTokenPlaintext) "Ẩn Token" else "Hiện Token",
                                                        tint = TextSecondary,
                                                        modifier = Modifier.size(18.dp)
                                                    )
                                                }
                                            }
                                        },
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedContainerColor = CharcoalBackground,
                                            unfocusedContainerColor = CharcoalBackground,
                                            focusedBorderColor = VioletAccent,
                                            unfocusedBorderColor = CharcoalSurfaceHighlight,
                                            focusedTextColor = TextPrimary,
                                            unfocusedTextColor = TextPrimary
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("github_token_input")
                                    )

                                    // Verify & Save / Clear row (never saves invalid/expired token)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Button(
                                            onClick = {
                                                scope.launch {
                                                    pushManager.validateAndSaveToken(tokenInput)
                                                }
                                            },
                                            enabled = !state.isValidating && !state.isPushing,
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = ElectricBlue,
                                                contentColor = Color.White
                                            ),
                                            shape = RoundedCornerShape(8.dp),
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 44.dp)
                                                .testTag("github_verify_token_button")
                                        ) {
                                            if (state.isValidating) {
                                                CircularProgressIndicator(
                                                    modifier = Modifier.size(16.dp),
                                                    color = Color.White,
                                                    strokeWidth = 2.dp
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text("Đang kiểm tra...", fontSize = 12.sp)
                                            } else {
                                                Icon(
                                                    imageVector = Icons.Default.VerifiedUser,
                                                    contentDescription = null,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text("Xác thực & Lưu Token", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                            }
                                        }

                                        if (state.verifiedUser != null || tokenInput.isNotBlank()) {
                                            OutlinedButton(
                                                onClick = {
                                                    tokenInput = ""
                                                    pushManager.clearSavedToken("Đã xóa GitHub Token khỏi bộ nhớ.")
                                                },
                                                enabled = !state.isValidating && !state.isPushing,
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                                                modifier = Modifier.heightIn(min = 44.dp)
                                            ) {
                                                Text("Xóa mã", color = TextSecondary, fontSize = 12.sp)
                                            }
                                        }
                                    }

                                    // Validation Notice / Inline Guidance Card (401-safe, no crash/console noise)
                                    state.validationNotice?.let { notice ->
                                        val isError = state.validationIsError
                                        Surface(
                                            color = if (isError) ColorErrorRed.copy(alpha = 0.12f) else ColorSuccessGreen.copy(alpha = 0.12f),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(
                                                1.dp,
                                                if (isError) ColorErrorRed.copy(alpha = 0.4f) else ColorSuccessGreen.copy(alpha = 0.4f)
                                            ),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                verticalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                Row(verticalAlignment = Alignment.CenterVertically) {
                                                    Icon(
                                                        imageVector = if (isError) Icons.Default.WarningAmber else Icons.Default.CheckCircle,
                                                        contentDescription = null,
                                                        tint = if (isError) ColorErrorRed else ColorSuccessGreen,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                    Spacer(modifier = Modifier.width(6.dp))
                                                    Text(
                                                        text = notice,
                                                        color = TextPrimary,
                                                        fontSize = 12.sp,
                                                        fontWeight = FontWeight.Medium
                                                    )
                                                }
                                                state.validationGuideSteps.forEach { step ->
                                                    Text(
                                                        text = step,
                                                        color = TextSecondary,
                                                        fontSize = 11.sp,
                                                        lineHeight = 15.sp
                                                    )
                                                }
                                            }
                                        }
                                    }

                                    HorizontalDivider(color = CharcoalSurfaceHighlight)

                                    // Storage Permission Banner if not yet granted
                                    if (!hasStoragePermission) {
                                        Surface(
                                            color = ColorWarningAmber.copy(alpha = 0.14f),
                                            shape = RoundedCornerShape(8.dp),
                                            border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.45f)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Security,
                                                    contentDescription = "Cấp quyền truy cập tệp",
                                                    tint = ColorWarningAmber,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text(
                                                    text = "Cần quyền đọc tất cả tệp để duyệt thư mục & tệp .zip trong bộ nhớ.",
                                                    color = TextPrimary,
                                                    fontSize = 11.sp,
                                                    lineHeight = 15.sp,
                                                    modifier = Modifier.weight(1f)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                TextButton(
                                                    onClick = {
                                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                                            try {
                                                                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                                                                    data = Uri.parse("package:${context.packageName}")
                                                                }
                                                                manageStorageLauncher.launch(intent)
                                                            } catch (_: Exception) {
                                                                manageStorageLauncher.launch(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                                                            }
                                                        } else {
                                                            legacyStoragePermLauncher.launch(
                                                                arrayOf(
                                                                    Manifest.permission.READ_EXTERNAL_STORAGE,
                                                                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                                                                )
                                                            )
                                                        }
                                                    },
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp)
                                                ) {
                                                    Text("Cấp quyền", color = ColorWarningAmber, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
                                                }
                                            }
                                        }
                                    }

                                    // Source Folder or .ZIP Selector
                                    Column(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        val isZipSelected = selectedSource.isFile && selectedSource.extension.equals("zip", ignoreCase = true)
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = "Nguồn mã nguồn đẩy lên GitHub:",
                                                color = TextSecondary,
                                                fontSize = 11.5.sp
                                            )
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = if (isZipSelected) CyanAccent.copy(alpha = 0.16f) else ColorWarningAmber.copy(alpha = 0.16f),
                                                border = BorderStroke(
                                                    1.dp,
                                                    if (isZipSelected) CyanAccent.copy(alpha = 0.45f) else ColorWarningAmber.copy(alpha = 0.45f)
                                                )
                                            ) {
                                                Text(
                                                    text = if (isZipSelected) {
                                                        "Tệp ZIP • ${FileItem.formatBytes(selectedSource.length())}"
                                                    } else {
                                                        "Thư mục"
                                                    },
                                                    color = if (isZipSelected) CyanAccent else ColorWarningAmber,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                                                )
                                            }
                                        }

                                        Text(
                                            text = if (isZipSelected) {
                                                "${selectedSource.name}\n${selectedSource.absolutePath}"
                                            } else {
                                                selectedSource.absolutePath
                                            },
                                            color = TextPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            OutlinedButton(
                                                onClick = { showFolderPicker = true },
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, CyanAccent.copy(alpha = 0.6f)),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .heightIn(min = 44.dp)
                                                    .testTag("github_pick_source_button")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.FolderOpen,
                                                    contentDescription = "Chọn thư mục hoặc tệp ZIP",
                                                    tint = CyanAccent,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Spacer(modifier = Modifier.width(5.dp))
                                                Text(
                                                    text = "Chọn thư mục / .ZIP",
                                                    color = CyanAccent,
                                                    fontSize = 11.5.sp,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }

                                            OutlinedButton(
                                                onClick = {
                                                    systemZipPickerLauncher.launch(
                                                        arrayOf(
                                                            "application/zip",
                                                            "application/x-zip-compressed",
                                                            "application/octet-stream"
                                                        )
                                                    )
                                                },
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, VioletAccent.copy(alpha = 0.6f)),
                                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                                modifier = Modifier
                                                    .heightIn(min = 44.dp)
                                                    .testTag("github_pick_system_zip_button")
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.FolderZip,
                                                    contentDescription = "Chọn tệp ZIP từ hệ thống",
                                                    tint = MagentaAccent,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                                Spacer(modifier = Modifier.width(5.dp))
                                                Text("Chọn .ZIP", color = MagentaAccent, fontSize = 11.5.sp)
                                            }
                                        }
                                    }

                                    // Single default repo toggle (keeps 1 repo per Token until Token expires)
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                                            Text(
                                                text = "Dùng 1 Repo mặc định theo Token",
                                                color = TextPrimary,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium
                                            )
                                            Text(
                                                text = "Không tạo repo mới; mọi bản dựng cập nhật vào repo này đến khi Token hết hạn.",
                                                color = TextMuted,
                                                fontSize = 10.5.sp,
                                                lineHeight = 14.sp
                                            )
                                        }
                                        Switch(
                                            checked = state.singleDefaultRepoMode,
                                            onCheckedChange = { enabled ->
                                                pushManager.setSingleDefaultRepoMode(enabled)
                                                if (enabled) {
                                                    repoNameInput = state.effectiveRepoName
                                                }
                                            },
                                            colors = SwitchDefaults.colors(
                                                checkedThumbColor = Color.White,
                                                checkedTrackColor = ColorSuccessGreen
                                            ),
                                            modifier = Modifier.testTag("github_single_repo_switch")
                                        )
                                    }

                                    // Private repo toggle
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = "Tạo kho lưu trữ riêng tư (Private Repo)",
                                            color = TextSecondary,
                                            fontSize = 12.sp
                                        )
                                        Switch(
                                            checked = isPrivateRepo,
                                            onCheckedChange = { isPrivateRepo = it },
                                            colors = SwitchDefaults.colors(
                                                checkedThumbColor = Color.White,
                                                checkedTrackColor = VioletAccent
                                            )
                                        )
                                    }

                                    // Repo name input + 🚀 Đẩy Lên GitHub & Tạo APK button
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        val isRepoLocked = state.singleDefaultRepoMode
                                        OutlinedTextField(
                                            value = if (isRepoLocked) state.effectiveRepoName else repoNameInput,
                                            onValueChange = { if (!isRepoLocked) repoNameInput = it },
                                            readOnly = isRepoLocked,
                                            placeholder = { Text("ten-repository", color = TextMuted, fontSize = 12.sp) },
                                            trailingIcon = if (isRepoLocked) {
                                                {
                                                    Icon(
                                                        imageVector = Icons.Default.Lock,
                                                        contentDescription = "Repo mặc định đang được khóa theo Token",
                                                        tint = ColorSuccessGreen,
                                                        modifier = Modifier.size(16.dp)
                                                    )
                                                }
                                            } else null,
                                            singleLine = true,
                                            colors = OutlinedTextFieldDefaults.colors(
                                                focusedContainerColor = CharcoalBackground,
                                                unfocusedContainerColor = CharcoalBackground,
                                                focusedBorderColor = if (isRepoLocked) ColorSuccessGreen.copy(alpha = 0.6f) else VioletAccent,
                                                unfocusedBorderColor = CharcoalSurfaceHighlight,
                                                focusedTextColor = TextPrimary,
                                                unfocusedTextColor = TextPrimary
                                            ),
                                            shape = RoundedCornerShape(10.dp),
                                            modifier = Modifier
                                                .weight(1f)
                                                .testTag("github_repo_input")
                                        )

                                        Button(
                                            onClick = {
                                                scope.launch {
                                                    pushManager.pushSourceAndBuildApk(
                                                        rawToken = tokenInput,
                                                        sourceDir = selectedSource,
                                                        rawRepoName = if (state.singleDefaultRepoMode) state.effectiveRepoName else repoNameInput,
                                                        isPrivate = isPrivateRepo
                                                    )
                                                }
                                            },
                                            enabled = !state.isPushing && !state.isValidating,
                                            colors = ButtonDefaults.buttonColors(
                                                containerColor = Color.Transparent,
                                                contentColor = Color.White
                                            ),
                                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                                            shape = RoundedCornerShape(10.dp),
                                            modifier = Modifier
                                                .weight(1.15f)
                                                .heightIn(min = 56.dp)
                                                .background(
                                                    brush = Brush.horizontalGradient(
                                                        listOf(ElectricBlue, VioletAccent, MagentaAccent)
                                                    ),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                                .testTag("github_push_button")
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.RocketLaunch,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = "🚀 Đẩy Lên GitHub\n& Tạo APK",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                lineHeight = 15.sp
                                            )
                                        }
                                    }

                                    // Standalone Workflow Trigger Button (for existing repo)
                                    OutlinedButton(
                                        onClick = {
                                            scope.launch {
                                                pushManager.triggerApkBuildWorkflowOnly(
                                                    rawToken = tokenInput,
                                                    rawRepoName = if (state.singleDefaultRepoMode) state.effectiveRepoName else repoNameInput
                                                )
                                            }
                                        },
                                        enabled = !state.isPushing && !state.isValidating && tokenInput.isNotBlank() &&
                                            (state.singleDefaultRepoMode || repoNameInput.isNotBlank()),
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, VioletAccent.copy(alpha = 0.55f)),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 48.dp)
                                            .testTag("github_trigger_workflow_button")
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.PlayArrow,
                                            contentDescription = "Chạy lại GitHub Actions build APK",
                                            tint = MagentaAccent,
                                            modifier = Modifier.size(17.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Kích hoạt lại GitHub Actions Build .APK",
                                            color = TextPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium
                                        )
                                    }

                                    // Live upload progress
                                    if (state.isPushing) {
                                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                            LinearProgressIndicator(
                                                progress = { state.pushProgress },
                                                color = MagentaAccent,
                                                trackColor = CharcoalSurfaceHighlight,
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(6.dp)
                                                    .clip(RoundedCornerShape(3.dp))
                                            )
                                            Text(
                                                text = state.pushStatusText,
                                                color = CyanAccent,
                                                fontSize = 11.sp,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }

                                    // Push error card
                                    state.lastPushError?.let { pushErr ->
                                        if (!state.validationIsError) {
                                            Surface(
                                                color = ColorErrorRed.copy(alpha = 0.12f),
                                                shape = RoundedCornerShape(8.dp),
                                                border = BorderStroke(1.dp, ColorErrorRed.copy(alpha = 0.4f)),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Text(
                                                    text = pushErr,
                                                    color = TextPrimary,
                                                    fontSize = 12.sp,
                                                    modifier = Modifier.padding(10.dp)
                                                )
                                            }
                                        }
                                    }

                                    // Push Success card with clickable Repo & GitHub Actions APK download links
                                    state.lastPushSuccess?.let { success ->
                                        Surface(
                                            color = ColorSuccessGreen.copy(alpha = 0.12f),
                                            shape = RoundedCornerShape(10.dp),
                                            border = BorderStroke(1.dp, ColorSuccessGreen.copy(alpha = 0.45f)),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(10.dp),
                                                verticalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                val successMsg = if (success.uploadedFilesCount > 0) {
                                                    "✅ Đã đẩy ${success.uploadedFilesCount} tệp lên ${success.repoFullName} và kích hoạt GitHub Actions biên dịch .APK!"
                                                } else {
                                                    "✅ Đã kích hoạt GitHub Actions biên dịch .APK cho ${success.repoFullName}!"
                                                }
                                                Text(
                                                    text = successMsg,
                                                    color = ColorSuccessGreen,
                                                    fontWeight = FontWeight.SemiBold,
                                                    fontSize = 12.sp
                                                )
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    OutlinedButton(
                                                        onClick = { openExternalUrl(context, success.repoUrl) },
                                                        shape = RoundedCornerShape(8.dp),
                                                        border = BorderStroke(1.dp, ElectricBlue),
                                                        modifier = Modifier.weight(1f)
                                                    ) {
                                                        Text("Mở Repository", color = ElectricBlue, fontSize = 11.5.sp)
                                                    }
                                                    Button(
                                                        onClick = { openExternalUrl(context, success.actionsUrl) },
                                                        colors = ButtonDefaults.buttonColors(containerColor = ColorSuccessGreen),
                                                        shape = RoundedCornerShape(8.dp),
                                                        modifier = Modifier.weight(1.2f)
                                                    ) {
                                                        Text(
                                                            "Tải APK (Actions)",
                                                            color = Color.Black,
                                                            fontWeight = FontWeight.Bold,
                                                            fontSize = 11.5.sp
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showFolderPicker) {
        FolderPickerDialog(
            title = "Chọn thư mục hoặc tệp .ZIP mã nguồn",
            initialDir = selectedSource.takeIf { it.exists() } ?: Environment.getExternalStorageDirectory(),
            showZipFiles = true,
            onDismiss = { showFolderPicker = false },
            onFolderSelected = { chosen ->
                onApplyChosenSource(chosen)
                showFolderPicker = false
            }
        )
    }
}
