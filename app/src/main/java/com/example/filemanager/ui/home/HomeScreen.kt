package com.example.filemanager.ui.home

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.R
import com.example.filemanager.model.FileItem
import com.example.filemanager.model.StorageVolumeInfo
import com.example.filemanager.ui.components.DarkPremiumBackdrop
import com.example.filemanager.ui.components.PremiumFeatureCard
import com.example.filemanager.ui.components.PremiumSectionHeader
import com.example.filemanager.ui.extensions.GitHubEnvSettingsDialog
import com.example.filemanager.ui.extensions.GitHubExtensionSummaryCard
import com.example.filemanager.ui.extensions.GoogleAccountPortalCard
import com.example.filemanager.viewmodel.AppOrientationMode
import com.example.filemanager.viewmodel.MainViewModel
import com.example.filemanager.viewmodel.ScreenDestination
import com.example.ui.theme.*
import java.io.File

private data class HomeCategory(
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val iconColor: Color,
    val onClick: () -> Unit
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: MainViewModel,
    onNavigateToFiles: (File) -> Unit,
    onNavigateToGameData: () -> Unit,
    onNavigateToAnalyzer: () -> Unit,
    onNavigateToSourcePackage: () -> Unit = {},
    onNavigateToSettings: () -> Unit,
    onNavigateToDualPane: () -> Unit = { viewModel.navigateTo(ScreenDestination.DualPane) }
) {
    val context = LocalContext.current
    val storageVolumes by viewModel.storageVolumes.collectAsState()
    val currentDirectory by viewModel.currentDirectory.collectAsState()
    val gitHubState by viewModel.gitHubPushManager.state.collectAsState()
    val orientationMode by viewModel.orientationMode.collectAsState()
    var showGitHubDialog by remember { mutableStateOf(false) }

    fun checkPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    var hasPermission by remember { mutableStateOf(checkPermission()) }

    val manageStorageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        hasPermission = checkPermission()
        if (hasPermission) viewModel.refreshStorageVolumes()
    }

    val standardPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        hasPermission = checkPermission()
        if (hasPermission) viewModel.refreshStorageVolumes()
    }

    fun requestStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                }
                manageStorageLauncher.launch(intent)
            } catch (e: Exception) {
                val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                manageStorageLauncher.launch(intent)
            }
        } else {
            standardPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                )
            )
        }
    }

    val safLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            viewModel.handleSafUri(uri)
        }
    }

    val internalDir = remember { Environment.getExternalStorageDirectory() }

    val categories = remember(storageVolumes) {
        val primary = storageVolumes.find { it.isPrimary }
        val internalSubtitle = if (primary != null && primary.totalBytes > 0L) {
            "Trống ${FileItem.formatBytes(primary.freeBytes)} / ${FileItem.formatBytes(primary.totalBytes)}"
        } else {
            "Thư mục gốc máy"
        }
        val sd = storageVolumes.find { it.isRemovable }
        val sdSubtitle = if (sd != null && sd.totalBytes > 0L) {
            "Trống ${FileItem.formatBytes(sd.freeBytes)} / ${FileItem.formatBytes(sd.totalBytes)}"
        } else {
            "Thẻ nhớ / SAF"
        }
        listOf(
            HomeCategory("Bộ nhớ trong", internalSubtitle, Icons.Default.PhoneAndroid, GoldAccent) {
                viewModel.openStorageRoot(internalDir)
            },
            HomeCategory("Thẻ nhớ SD", sdSubtitle, Icons.Default.SdCard, CyanAccent) {
                if (sd != null) {
                    viewModel.openStorageRoot(File(sd.path))
                } else {
                    safLauncher.launch(null)
                }
            }
        )
    }

    Scaffold(
        topBar = {
            Surface(
                color = ObsidianDeep.copy(alpha = 0.94f),
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
            ) {
                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFF070E1E),
                                border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.55f)),
                                modifier = Modifier.size(44.dp)
                            ) {
                                Image(
                                    painter = painterResource(id = R.drawable.ic_launcher_dark_premium_1795151421027),
                                    contentDescription = "Biểu tượng File Manager Pro",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = buildAnnotatedString {
                                        withStyle(SpanStyle(color = TextPrimary, fontWeight = FontWeight.Bold)) {
                                            append("File Manager ")
                                        }
                                        withStyle(SpanStyle(color = GoldAccent, fontWeight = FontWeight.ExtraBold)) {
                                            append("Pro")
                                        }
                                    },
                                    fontSize = 18.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "Hướng hiển thị: ${orientationMode.label}",
                                    color = TextSecondary,
                                    fontSize = 11.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            HeaderSquareIconButton(
                                icon = when (orientationMode) {
                                    AppOrientationMode.AUTO -> Icons.Default.ScreenRotation
                                    AppOrientationMode.PORTRAIT -> Icons.Default.StayCurrentPortrait
                                    AppOrientationMode.LANDSCAPE -> Icons.Default.StayCurrentLandscape
                                },
                                contentDescription = "Đổi hướng hiển thị (${orientationMode.label})",
                                tint = VioletGlow,
                                modifier = Modifier.testTag("home_orientation_toggle_button"),
                                onClick = { viewModel.cycleOrientationMode() }
                            )
                            HeaderSquareIconButton(
                                icon = Icons.Default.Search,
                                contentDescription = "Tìm kiếm",
                                tint = CyanAccent,
                                onClick = {
                                    viewModel.openStorageRoot(internalDir)
                                    viewModel.setSearchQuery("")
                                }
                            )
                            HeaderSquareIconButton(
                                icon = Icons.Default.Settings,
                                contentDescription = "Cài đặt",
                                tint = GoldAccent,
                                onClick = onNavigateToSettings
                            )
                        }
                    }
                    HorizontalDivider(color = CharcoalSurfaceHighlight, thickness = 0.8.dp)
                }
            }
        },
        containerColor = CharcoalBackground
    ) { padding ->
        DarkPremiumBackdrop(
            modifier = Modifier.padding(padding)
        ) {
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val isLandscape = maxWidth > maxHeight && maxWidth >= 560.dp

                val permissionBanner: @Composable () -> Unit = {
                    if (!hasPermission) {
                        Surface(
                            color = GoldAccent.copy(alpha = 0.1f),
                            shape = RoundedCornerShape(16.dp),
                            border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.48f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = GoldAccent.copy(alpha = 0.16f),
                                    border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.5f)),
                                    modifier = Modifier.size(42.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.Security,
                                            contentDescription = null,
                                            tint = GoldAccent,
                                            modifier = Modifier.size(21.dp)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Cần quyền truy cập bộ nhớ",
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary,
                                        fontSize = 13.5.sp
                                    )
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Cấp quyền quản lý toàn bộ tệp trên thiết bị.",
                                        color = TextSecondary,
                                        fontSize = 11.5.sp
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(
                                    onClick = { requestStoragePermission() },
                                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                    modifier = Modifier.heightIn(min = 48.dp)
                                ) {
                                    Text("Cấp quyền", color = Color.Black, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }

                val storageTabsSection: @Composable () -> Unit = {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PremiumSectionHeader(
                            title = "BỘ NHỚ & THẺ NHỚ",
                            accentColor = GoldAccent
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CategoryRowCard(
                                category = categories[0],
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("home_internal_storage_card")
                            )
                            if (categories.size > 1) {
                                CategoryRowCard(
                                    category = categories[1],
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("home_sd_storage_card")
                                )
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }

                val featureCardsSection: @Composable () -> Unit = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PremiumSectionHeader(
                            title = "TÍNH NĂNG CHÍNH",
                            accentColor = CyanAccent
                        )

                        PremiumFeatureCard(
                            title = "Cửa sổ kép (Dual Pane)",
                            subtitle = "Chia đôi màn hình, kéo thả & sao chép giữa 2 thư mục",
                            icon = Icons.Default.Splitscreen,
                            accentColor = ElectricBlue,
                            modifier = Modifier.testTag("home_dual_pane_card")
                        ) {
                            viewModel.toggleDualPane(true)
                            viewModel.openStorageRoot(internalDir)
                        }

                        PremiumFeatureCard(
                            title = "Dữ liệu Game (OBB / PAK / Asset)",
                            subtitle = "Nhận diện UnityFS, Unreal PAK, DEX & Entropy mã hóa",
                            icon = Icons.Default.SportsEsports,
                            accentColor = VioletGlow,
                            modifier = Modifier.testTag("home_game_data_card")
                        ) {
                            onNavigateToGameData()
                        }

                        PremiumFeatureCard(
                            title = "Công cụ phân tích & Kiểm tra",
                            subtitle = "APK Inspector, SQLite Viewer, Hex Editor, Hash & Trùng lặp",
                            icon = Icons.Default.BuildCircle,
                            accentColor = GoldAccent,
                            modifier = Modifier.testTag("home_analyzer_card")
                        ) {
                            onNavigateToAnalyzer()
                        }

                        PremiumFeatureCard(
                            title = "Tải về mã nguồn cập nhật (.ZIP)",
                            subtitle = "Đóng gói đầy đủ tệp cập nhật & đẩy 1-chạm lên GitHub",
                            icon = Icons.Default.Inventory2,
                            accentColor = CyanGlow,
                            badgeText = "MỚI",
                            modifier = Modifier.testTag("home_source_package_card")
                        ) {
                            onNavigateToSourcePackage()
                        }
                    }
                }

                val extensionsSection: @Composable () -> Unit = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        PremiumSectionHeader(
                            title = "TIỆN ÍCH MỞ RỘNG (GOOGLE & GITHUB APK)",
                            accentColor = VioletGlow
                        )
                        GoogleAccountPortalCard()
                        GitHubExtensionSummaryCard(
                            gitHubState = gitHubState,
                            onOpenSettingsAndPushDialog = { showGitHubDialog = true }
                        )
                    }
                }

                if (isLandscape) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .windowInsetsPadding(WindowInsets.displayCutout.only(WindowInsetsSides.End))
                            .padding(horizontal = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1.08f)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState())
                                .padding(top = 12.dp, bottom = 22.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            permissionBanner()
                            storageTabsSection()
                            featureCardsSection()
                        }
                        Column(
                            modifier = Modifier
                                .weight(0.92f)
                                .fillMaxHeight()
                                .verticalScroll(rememberScrollState())
                                .padding(top = 12.dp, bottom = 22.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            extensionsSection()
                        }
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 14.dp),
                        contentPadding = PaddingValues(top = 12.dp, bottom = 22.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (!hasPermission) {
                            item { permissionBanner() }
                        }
                        item { storageTabsSection() }
                        item { featureCardsSection() }
                        item { extensionsSection() }
                    }
                }
            }
        }
    }

    if (showGitHubDialog) {
        GitHubEnvSettingsDialog(
            pushManager = viewModel.gitHubPushManager,
            defaultDirectory = currentDirectory,
            onDismiss = { showGitHubDialog = false }
        )
    }
}

@Composable
private fun HeaderSquareIconButton(
    icon: ImageVector,
    contentDescription: String,
    tint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CharcoalSurfaceVariant.copy(alpha = 0.7f),
        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
        modifier = modifier
            .size(48.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.size(21.dp)
            )
        }
    }
}

@Composable
private fun CategoryRowCard(
    category: HomeCategory,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(14.dp)
    Surface(
        color = Color.Transparent,
        shape = shape,
        border = BorderStroke(1.dp, category.iconColor.copy(alpha = 0.35f)),
        modifier = modifier
            .heightIn(min = 64.dp)
            .clip(shape)
            .background(
                brush = Brush.horizontalGradient(
                    listOf(category.iconColor.copy(alpha = 0.1f), ObsidianCardTop, ObsidianCardBottom)
                )
            )
            .clickable { category.onClick() }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = category.iconColor.copy(alpha = 0.15f),
                border = BorderStroke(1.dp, category.iconColor.copy(alpha = 0.45f)),
                modifier = Modifier.size(38.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        category.icon,
                        contentDescription = null,
                        tint = category.iconColor,
                        modifier = Modifier.size(19.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = category.title,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 13.sp
                )
                Text(
                    text = category.subtitle,
                    color = TextMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 10.5.sp
                )
            }
        }
    }
}
