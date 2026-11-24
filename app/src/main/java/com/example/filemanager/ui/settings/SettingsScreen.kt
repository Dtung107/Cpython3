package com.example.filemanager.ui.settings

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.filemanager.ui.components.DarkPremiumBackdrop
import com.example.filemanager.ui.components.PremiumFeatureCard
import com.example.filemanager.ui.components.PremiumSectionHeader
import com.example.filemanager.ui.extensions.GitHubEnvSettingsDialog
import com.example.filemanager.ui.extensions.GitHubExtensionSummaryCard
import com.example.filemanager.ui.extensions.GoogleAccountPortalCard
import com.example.filemanager.viewmodel.AppOrientationMode
import com.example.filemanager.viewmodel.MainViewModel
import com.example.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit,
    onNavigateToSourcePackage: () -> Unit = {}
) {
    val showHidden by viewModel.showHiddenFiles.collectAsState()
    val isGridView by viewModel.isGridView.collectAsState()
    val orientationMode by viewModel.orientationMode.collectAsState()
    val currentDirectory by viewModel.currentDirectory.collectAsState()
    val gitHubState by viewModel.gitHubPushManager.state.collectAsState()
    var showGitHubDialog by remember { mutableStateOf(false) }

    val safLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            viewModel.handleSafUri(uri)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cài đặt", color = TextPrimary, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ObsidianDeep.copy(alpha = 0.94f))
            )
        },
        containerColor = CharcoalBackground
    ) { padding ->
        DarkPremiumBackdrop(
            modifier = Modifier.padding(padding)
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 14.dp),
                contentPadding = PaddingValues(top = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Extensions: Google Account & GitHub Token / APK Build
                item {
                    PremiumSectionHeader(
                        title = "TIỆN ÍCH MỞ RỘNG (GOOGLE & GITHUB APK)",
                        accentColor = VioletGlow
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        GoogleAccountPortalCard()
                        GitHubExtensionSummaryCard(
                            gitHubState = gitHubState,
                            onOpenSettingsAndPushDialog = { showGitHubDialog = true }
                        )
                    }
                }

                // Updated Source Code Export Shortcut
                item {
                    PremiumSectionHeader(
                        title = "MÃ NGUỒN CẬP NHẬT",
                        accentColor = CyanAccent
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    PremiumFeatureCard(
                        title = "Tải về gói mã nguồn cập nhật (.ZIP)",
                        subtitle = "Lưu gói mã nguồn dự án hoàn chỉnh hoặc đẩy lên GitHub",
                        icon = Icons.Default.Inventory2,
                        accentColor = CyanGlow,
                        badgeText = "ZIP"
                    ) {
                        onNavigateToSourcePackage()
                    }
                }

                // Display Settings
                item {
                    PremiumSectionHeader(
                        title = "GIAO DIỆN & HIỂN THỊ",
                        accentColor = GoldAccent
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Surface(
                        color = CharcoalSurface,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Hiện tệp & thư mục ẩn", color = TextPrimary, fontWeight = FontWeight.Medium)
                                    Text("Hiển thị các tệp bắt đầu bằng dấu chấm (.)", color = TextMuted, fontSize = 12.sp)
                                }
                                Switch(
                                    checked = showHidden,
                                    onCheckedChange = { viewModel.toggleShowHiddenFiles() },
                                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = CyanAccent)
                                )
                            }

                            HorizontalDivider(color = CharcoalDivider, modifier = Modifier.padding(vertical = 10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Chế độ xem dạng lưới (Grid)", color = TextPrimary, fontWeight = FontWeight.Medium)
                                    Text("Hiển thị tệp dưới dạng ô biểu tượng lớn", color = TextMuted, fontSize = 12.sp)
                                }
                                Switch(
                                    checked = isGridView,
                                    onCheckedChange = { viewModel.toggleGridView() },
                                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = GoldAccent)
                                )
                            }

                            HorizontalDivider(color = CharcoalDivider, modifier = Modifier.padding(vertical = 10.dp))

                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Hướng hiển thị màn hình", color = TextPrimary, fontWeight = FontWeight.Medium)
                                Text("Tự động xoay theo cảm biến hoặc khóa cố định Chân dung / Xoay ngang", color = TextMuted, fontSize = 12.sp)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    AppOrientationMode.entries.forEach { mode ->
                                        val isSelected = orientationMode == mode
                                        val chipColor = when (mode) {
                                            AppOrientationMode.AUTO -> VioletGlow
                                            AppOrientationMode.PORTRAIT -> CyanAccent
                                            AppOrientationMode.LANDSCAPE -> GoldAccent
                                        }
                                        OutlinedButton(
                                            onClick = { viewModel.setOrientationMode(mode) },
                                            shape = RoundedCornerShape(10.dp),
                                            border = BorderStroke(
                                                width = if (isSelected) 1.4.dp else 1.dp,
                                                color = if (isSelected) chipColor else CharcoalSurfaceHighlight
                                            ),
                                            colors = ButtonDefaults.outlinedButtonColors(
                                                containerColor = if (isSelected) chipColor.copy(alpha = 0.18f) else CharcoalBackground,
                                                contentColor = if (isSelected) chipColor else TextSecondary
                                            ),
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                            modifier = Modifier
                                                .weight(1f)
                                                .heightIn(min = 48.dp)
                                                .testTag("settings_orientation_${mode.name.lowercase()}")
                                        ) {
                                            Text(
                                                text = mode.label,
                                                fontSize = 11.5.sp,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                maxLines = 1
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Storage Access Framework
                item {
                    PremiumSectionHeader(
                        title = "QUYỀN LƯU TRỮ (STORAGE ACCESS FRAMEWORK)",
                        accentColor = ElectricBlue
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Surface(
                        color = CharcoalSurface,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                text = "Ứng dụng tuân thủ nghiêm ngặt chính sách bảo mật của Android bằng Storage Access Framework (SAF). Không yêu cầu quyền Root, bảo vệ tuyệt đối dữ liệu người dùng.",
                                color = TextSecondary,
                                fontSize = 13.sp,
                                lineHeight = 18.sp
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { safLauncher.launch(null) },
                                colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.heightIn(min = 48.dp)
                            ) {
                                Icon(Icons.Default.FolderSpecial, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Cấp quyền thư mục tùy chọn (SAF)", fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                // About App
                item {
                    PremiumSectionHeader(
                        title = "THÔNG TIN ỨNG DỤNG",
                        accentColor = VioletGlow
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    Surface(
                        color = CharcoalSurface,
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.28f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFF070E1E),
                                    border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.5f)),
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Image(
                                        painter = painterResource(id = R.drawable.ic_launcher_dark_premium_1795151421027),
                                        contentDescription = "Biểu tượng ứng dụng",
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("FILE MANAGER PRO", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                                    Text("Phiên bản 1.0.0 • Dark Premium Edition", color = GoldAccent, fontSize = 12.sp)
                                }
                            }

                            HorizontalDivider(color = CharcoalDivider, modifier = Modifier.padding(vertical = 4.dp))

                            Text("• Giao diện: Dark Premium Obsidian M3 (Cyan / Vàng / Tím)", color = TextSecondary, fontSize = 12.sp)
                            Text("• Phân tích APK: Manifest, CPU ABIs, DEX, Quyền, Chữ ký số", color = TextSecondary, fontSize = 12.sp)
                            Text("• SQLite Viewer: Phân trang lớn, console SQL SELECT chỉ đọc, xuất CSV/JSON", color = TextSecondary, fontSize = 12.sp)
                            Text("• Hex Editor: Đọc chunked streaming, tìm kiếm hex/text, nhảy offset", color = TextSecondary, fontSize = 12.sp)
                            Text("• Game Data: Nhận diện UnityFS, Unreal PAK, Dalvik DEX, Entropy mã hóa", color = TextSecondary, fontSize = 12.sp)
                            Text("• Tự động build: Tích hợp sẵn GitHub Actions CI/CD (.github/workflows/android.yml)", color = TextSecondary, fontSize = 12.sp)
                            Text("• An toàn: Hoạt động 100% offline, không gửi dữ liệu ra máy chủ", color = TextSecondary, fontSize = 12.sp)
                        }
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
