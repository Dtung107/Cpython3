package com.example.filemanager.ui.source

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.example.filemanager.model.FileItem
import com.example.filemanager.ui.components.DarkPremiumBackdrop
import com.example.filemanager.ui.components.PremiumFeatureCard
import com.example.filemanager.ui.components.PremiumSectionHeader
import com.example.filemanager.ui.extensions.GitHubEnvSettingsDialog
import com.example.filemanager.viewmodel.MainViewModel
import com.example.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipInputStream

private const val BUNDLED_SOURCE_ASSET = "filemanagerpro-updated-source.zip"
private const val EXPORT_FILE_NAME = "FileManagerPro-Source-Updated.zip"

private data class PackagedEntryInfo(
    val path: String,
    val sizeBytes: Long
)

private data class PackagedSourceSummary(
    val totalFiles: Int = 0,
    val totalUncompressedBytes: Long = 0L,
    val zipBytes: Long = 0L,
    val highlightedFiles: List<PackagedEntryInfo> = emptyList(),
    val isReady: Boolean = false
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcePackageScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onOpenArchiveViewer: (File) -> Unit,
    onOpenFolderInExplorer: (File) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var summary by remember { mutableStateOf(PackagedSourceSummary()) }
    var isScanning by remember { mutableStateOf(true) }
    var isExporting by remember { mutableStateOf(false) }
    var exportedZipFile by remember { mutableStateOf<File?>(null) }
    var savedDisplayPath by remember { mutableStateOf<String?>(null) }
    var showGitHubDialog by remember { mutableStateOf(false) }

    BackHandler { onBack() }

    val createDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/zip")
    ) { targetUri: Uri? ->
        if (targetUri != null) {
            isExporting = true
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    writeBundledZipToUri(context, targetUri)
                }
                isExporting = false
                if (result != null) {
                    exportedZipFile = result.first
                    savedDisplayPath = result.second
                    snackbarHostState.showSnackbar("Đã lưu vào vị trí đã chọn")
                } else {
                    snackbarHostState.showSnackbar("Không thể ghi tệp .zip vào vị trí đã chọn")
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        val loaded = withContext(Dispatchers.IO) {
            inspectBundledSourceZip(context)
        }
        summary = loaded
        isScanning = false
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Mã nguồn cập nhật",
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp
                        )
                        Text(
                            text = "Đóng gói đầy đủ mã nguồn & cấu hình build APK",
                            color = TextSecondary,
                            fontSize = 11.5.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại",
                            tint = TextPrimary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ObsidianDeep.copy(alpha = 0.92f)
                )
            )
        },
        containerColor = CharcoalBackground
    ) { padding ->
        DarkPremiumBackdrop(
            modifier = Modifier.padding(padding)
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.displayCutout.only(WindowInsetsSides.End))
            ) {
                val isLandscape = maxWidth > maxHeight && maxWidth >= 560.dp

                val heroCard: @Composable () -> Unit = {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color.Transparent,
                        border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.42f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(
                                brush = Brush.horizontalGradient(
                                    listOf(
                                        CyanGlow.copy(alpha = 0.14f),
                                        ObsidianCardTop,
                                        VioletGlow.copy(alpha = 0.14f)
                                    )
                                )
                            )
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = GoldAccent.copy(alpha = 0.16f),
                                        border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.5f)),
                                        modifier = Modifier.size(46.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Default.Inventory2,
                                                contentDescription = null,
                                                tint = GoldAccent,
                                                modifier = Modifier.size(24.dp)
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column {
                                        Text(
                                            text = EXPORT_FILE_NAME,
                                            color = TextPrimary,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.5.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = if (isScanning) {
                                                "Đang kiểm tra gói mã nguồn..."
                                            } else if (summary.isReady) {
                                                "${summary.totalFiles} tệp • Nén ${FileItem.formatBytes(summary.zipBytes)} (Gốc ${FileItem.formatBytes(summary.totalUncompressedBytes)})"
                                            } else {
                                                "Chưa tìm thấy tệp đóng gói"
                                            },
                                            color = CyanAccent,
                                            fontSize = 11.5.sp
                                        )
                                    }
                                }
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = ColorSuccessGreen.copy(alpha = 0.16f),
                                    border = BorderStroke(1.dp, ColorSuccessGreen.copy(alpha = 0.45f))
                                ) {
                                    Text(
                                        text = "100% READY",
                                        color = ColorSuccessGreen,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            Text(
                                text = "Bao gồm toàn bộ mã nguồn Kotlin/Compose giao diện Dark Premium mới, hỗ trợ 2 cửa sổ độc lập, xoay màn hình tự động, biểu tượng launcher và workflow GitHub Actions build .APK.",
                                color = TextSecondary,
                                fontSize = 12.sp,
                                lineHeight = 17.sp
                            )

                            // Primary Download Button
                            Button(
                                onClick = {
                                    if (!isExporting && summary.isReady) {
                                        isExporting = true
                                        scope.launch {
                                            val result = withContext(Dispatchers.IO) {
                                                exportSourceZipToDevice(context)
                                            }
                                            isExporting = false
                                            if (result != null) {
                                                exportedZipFile = result.first
                                                savedDisplayPath = result.second
                                                snackbarHostState.showSnackbar("Đã lưu vào: ${result.second}")
                                            } else {
                                                snackbarHostState.showSnackbar("Không thể xuất tệp .zip mã nguồn")
                                            }
                                        }
                                    }
                                },
                                enabled = !isExporting && summary.isReady,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.Transparent,
                                    contentColor = Color.Black
                                ),
                                contentPadding = PaddingValues(0.dp),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(
                                        brush = Brush.horizontalGradient(
                                            listOf(CyanGlow, Color(0xFF38BDF8), GoldAccent)
                                        )
                                    )
                                    .testTag("download_updated_source_zip_button")
                            ) {
                                if (isExporting) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(18.dp),
                                        color = Color.Black,
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Đang lưu tệp .ZIP...", fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Download,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Tải về mã nguồn cập nhật (.ZIP)",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.5.sp
                                    )
                                }
                            }

                            // Choose Custom Save Location (SAF CreateDocument)
                            OutlinedButton(
                                onClick = {
                                    if (!isExporting && summary.isReady) {
                                        createDocumentLauncher.launch(EXPORT_FILE_NAME)
                                    }
                                },
                                enabled = !isExporting && summary.isReady,
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, CyanAccent.copy(alpha = 0.55f)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("save_as_updated_source_zip_button")
                            ) {
                                Icon(Icons.Default.DriveFileMove, contentDescription = null, tint = CyanAccent, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Lưu chọn vị trí (.ZIP) / Google Drive",
                                    color = CyanAccent,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 12.5.sp
                                )
                            }
                        }
                    }
                }

                val previewNoticeCard: @Composable () -> Unit = {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = GoldAccent.copy(alpha = 0.08f),
                        border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.35f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = GoldAccent,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "Lưu ý AI Studio Preview: Khi bấm tải về trên bản xem trước trình duyệt, tệp lưu vào Download/ của máy ảo đám mây chứ không tự tải về Chrome điện thoại. Để lấy mã nguồn & file .APK cài trực tiếp lên điện thoại, hãy dùng nút \"Đẩy gói này lên GitHub & Tạo APK\" bên dưới.",
                                color = TextSecondary,
                                fontSize = 11.5.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                val confirmationCard: @Composable () -> Unit = {
                    val savedFile = exportedZipFile
                    if (savedFile != null && !savedDisplayPath.isNullOrBlank()) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = ColorSuccessGreen.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, ColorSuccessGreen.copy(alpha = 0.45f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = ColorSuccessGreen,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Đã lưu gói mã nguồn thành công",
                                        color = ColorSuccessGreen,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp
                                    )
                                }
                                Text(
                                    text = savedDisplayPath ?: savedFile.absolutePath,
                                    color = TextPrimary,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedButton(
                                        onClick = { onOpenArchiveViewer(savedFile) },
                                        shape = RoundedCornerShape(10.dp),
                                        border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.6f)),
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 48.dp)
                                    ) {
                                        Icon(Icons.Default.FolderZip, null, tint = CyanGlow, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Xem tệp ZIP", color = CyanGlow, fontSize = 12.sp)
                                    }
                                    OutlinedButton(
                                        onClick = { shareExportedZip(context, savedFile) },
                                        shape = RoundedCornerShape(10.dp),
                                        border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.6f)),
                                        modifier = Modifier
                                            .weight(1f)
                                            .heightIn(min = 48.dp)
                                    ) {
                                        Icon(Icons.Default.Share, null, tint = GoldAccent, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text("Chia sẻ .ZIP", color = GoldAccent, fontSize = 12.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                val quickActionsSection: @Composable () -> Unit = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PremiumSectionHeader(
                            title = "THAO TÁC NHANH VỚI GÓI MÃ NGUỒN",
                            accentColor = VioletGlow
                        )

                        PremiumFeatureCard(
                            title = "Đẩy gói này lên GitHub & Tạo APK",
                            subtitle = "Tự động chọn tệp .ZIP cập nhật & mở cài đặt đẩy 1-Chạm",
                            icon = Icons.Default.RocketLaunch,
                            accentColor = VioletGlow,
                            badgeText = "CI/CD"
                        ) {
                            scope.launch {
                                val prepared = exportedZipFile ?: withContext(Dispatchers.IO) {
                                    prepareInternalZipCopy(context)
                                }
                                if (prepared != null) {
                                    exportedZipFile = prepared
                                    val repo = viewModel.gitHubPushManager.state.value.effectiveRepoName
                                    viewModel.gitHubPushManager.updateRepoAndFolderPreferences(repo, prepared.absolutePath)
                                    showGitHubDialog = true
                                } else {
                                    snackbarHostState.showSnackbar("Không chuẩn bị được tệp mã nguồn")
                                }
                            }
                        }

                        PremiumFeatureCard(
                            title = "Mở trong Trình quản lý tệp",
                            subtitle = "Duyệt thư mục chứa tệp mã nguồn vừa xuất",
                            icon = Icons.Default.FolderOpen,
                            accentColor = GoldAccent
                        ) {
                            scope.launch {
                                val publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                                val targetDir = if (savedDisplayPath?.contains("Download") == true &&
                                    publicDownloads != null && publicDownloads.exists()
                                ) {
                                    publicDownloads
                                } else {
                                    val prepared = exportedZipFile ?: withContext(Dispatchers.IO) {
                                        prepareInternalZipCopy(context)
                                    }
                                    prepared?.parentFile ?: publicDownloads
                                }
                                if (targetDir != null) {
                                    onOpenFolderInExplorer(targetDir)
                                } else {
                                    snackbarHostState.showSnackbar("Không tìm thấy thư mục lưu tệp")
                                }
                            }
                        }
                    }
                }

                if (isLandscape) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1.05f)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState())
                                .padding(top = 10.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            heroCard()
                            previewNoticeCard()
                            confirmationCard()
                            quickActionsSection()
                        }
                        LazyColumn(
                            modifier = Modifier
                                .weight(0.95f)
                                .fillMaxHeight(),
                            contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            item {
                                PremiumSectionHeader(
                                    title = "THÀNH PHẦN ĐÓNG GÓI (${summary.totalFiles} TỆP)",
                                    accentColor = CyanAccent
                                )
                            }
                            items(summary.highlightedFiles, key = { it.path }) { entry ->
                                PackagedEntryRow(entry)
                            }
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 14.dp),
                        contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item { heroCard() }
                        item { previewNoticeCard() }
                        if (exportedZipFile != null && !savedDisplayPath.isNullOrBlank()) {
                            item { confirmationCard() }
                        }
                        item { quickActionsSection() }

                        if (summary.highlightedFiles.isNotEmpty()) {
                            item {
                                PremiumSectionHeader(
                                    title = "THÀNH PHẦN ĐÓNG GÓI (${summary.totalFiles} TỆP)",
                                    accentColor = CyanAccent
                                )
                            }

                            items(summary.highlightedFiles, key = { it.path }) { entry ->
                                PackagedEntryRow(entry)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showGitHubDialog) {
        GitHubEnvSettingsDialog(
            pushManager = viewModel.gitHubPushManager,
            defaultDirectory = exportedZipFile ?: viewModel.currentDirectory.collectAsState().value,
            onDismiss = { showGitHubDialog = false }
        )
    }
}

@Composable
private fun PackagedEntryRow(entry: PackagedEntryInfo) {
    Surface(
        color = CharcoalSurface,
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val badgeColor = when {
                entry.path.endsWith(".kt") -> CyanAccent
                entry.path.endsWith(".yml") || entry.path.contains("keystore") -> VioletGlow
                entry.path.endsWith(".kts") || entry.path.endsWith(".properties") -> GoldAccent
                else -> ColorSuccessGreen
            }
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(badgeColor)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = entry.path,
                color = TextPrimary,
                fontFamily = FontFamily.Monospace,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = FileItem.formatBytes(entry.sizeBytes),
                color = TextMuted,
                fontSize = 11.sp
            )
        }
    }
}

private fun inspectBundledSourceZip(context: Context): PackagedSourceSummary {
    return try {
        val zipBytesArray = context.assets.open(BUNDLED_SOURCE_ASSET).use { it.readBytes() }
        val zipSize = zipBytesArray.size.toLong()

        val allEntries = mutableListOf<PackagedEntryInfo>()
        var totalUncompressed = 0L
        val buffer = ByteArray(8192)
        ZipInputStream(zipBytesArray.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                if (!entry.isDirectory) {
                    var sz = entry.size
                    if (sz < 0L) {
                        var counted = 0L
                        while (true) {
                            val read = zis.read(buffer)
                            if (read <= 0) break
                            counted += read
                        }
                        sz = counted
                    }
                    totalUncompressed += sz
                    allEntries.add(PackagedEntryInfo(entry.name, sz))
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }

        val prioritized = allEntries.sortedWith(
            compareBy<PackagedEntryInfo>(
                { !(it.path.startsWith(".github") || it.path.contains("keystore") || it.path.endsWith("gradle.properties")) },
                { !(it.path.endsWith(".kt") || it.path.endsWith(".kts")) },
                { it.path }
            )
        ).take(40)

        PackagedSourceSummary(
            totalFiles = allEntries.size,
            totalUncompressedBytes = totalUncompressed,
            zipBytes = zipSize,
            highlightedFiles = prioritized,
            isReady = allEntries.isNotEmpty()
        )
    } catch (_: Exception) {
        PackagedSourceSummary(isReady = false)
    }
}

private fun prepareInternalZipCopy(context: Context): File? {
    return try {
        val exportDir = File(context.filesDir, "exports").apply { mkdirs() }
        val localFile = File(exportDir, EXPORT_FILE_NAME)
        context.assets.open(BUNDLED_SOURCE_ASSET).use { input ->
            FileOutputStream(localFile).use { output ->
                input.copyTo(output)
            }
        }
        localFile
    } catch (_: Exception) {
        null
    }
}

private fun writeBundledZipToUri(context: Context, targetUri: Uri): Pair<File, String>? {
    val localCopy = prepareInternalZipCopy(context) ?: return null
    return try {
        context.contentResolver.openOutputStream(targetUri)?.use { out ->
            localCopy.inputStream().use { it.copyTo(out) }
        } ?: return null
        val display = targetUri.lastPathSegment ?: EXPORT_FILE_NAME
        localCopy to display
    } catch (_: Exception) {
        null
    }
}

private fun exportSourceZipToDevice(context: Context): Pair<File, String>? {
    val localCopy = prepareInternalZipCopy(context) ?: return null
    return try {
        // 1. Prefer clean direct overwrite in /storage/emulated/0/Download/ when writable (avoids (1)/(2) duplicates)
        val publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (publicDownloads != null && (publicDownloads.exists() || publicDownloads.mkdirs()) && publicDownloads.canWrite()) {
            val target = File(publicDownloads, EXPORT_FILE_NAME)
            localCopy.copyTo(target, overwrite = true)
            MediaScannerConnection.scanFile(
                context,
                arrayOf(target.absolutePath),
                arrayOf("application/zip"),
                null
            )
            return target to "Download/$EXPORT_FILE_NAME (${target.absolutePath})"
        }

        // 2. Fallback via MediaStore Downloads (scoped storage API 29+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, EXPORT_FILE_NAME)
                put(MediaStore.Downloads.MIME_TYPE, "application/zip")
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            if (uri != null) {
                resolver.openOutputStream(uri)?.use { out ->
                    localCopy.inputStream().use { it.copyTo(out) }
                }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                return localCopy to "Download/$EXPORT_FILE_NAME"
            }
        }
        localCopy to localCopy.absolutePath
    } catch (_: Exception) {
        localCopy to localCopy.absolutePath
    }
}

private fun shareExportedZip(context: Context, zipFile: File) {
    try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", zipFile)
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/zip"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, EXPORT_FILE_NAME)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(shareIntent, "Chia sẻ mã nguồn cập nhật (.ZIP)"))
    } catch (_: Exception) {
    }
}
