package com.example.filemanager.ui.explorer

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.View
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.DriveFileMove
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.DragAndDropTransferData
import androidx.compose.ui.draganddrop.mimeTypes
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.example.MainActivity
import com.example.SecondaryWindowActivity
import com.example.filemanager.apk.ApkInstaller
import com.example.filemanager.model.*
import com.example.filemanager.ui.archive.CreateArchiveDialog
import com.example.filemanager.ui.archive.FolderPickerDialog
import com.example.filemanager.utils.CrossWindowTransferBus
import com.example.filemanager.utils.FileThumbnailLoader
import com.example.filemanager.utils.FileUtils
import com.example.filemanager.utils.HashUtils
import com.example.filemanager.utils.NetworkSharingManager
import com.example.filemanager.viewmodel.DualPaneSplit
import com.example.filemanager.viewmodel.MainViewModel
import com.example.filemanager.viewmodel.ScreenDestination
import com.example.ui.theme.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.util.UUID

private val CoralChipTint = ColorErrorRed
private val ChipBorderColor = CharcoalSurfaceHighlight
private val DocumentsUIDarkBg = CharcoalBackground
private val DocumentsUIDivider = CharcoalSurfaceHighlight
private val DocumentsUIFolderGrey = TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FileExplorerScreen(
    viewModel: MainViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)

    // Primary pane state
    val currentDir by viewModel.currentDirectory.collectAsState()
    val activeCategoryTitle by viewModel.activeCategoryTitle.collectAsState()
    val fileItems by viewModel.fileItems.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val storageVolumes by viewModel.storageVolumes.collectAsState()

    // Dual pane state
    val isDualPane by viewModel.isDualPaneMode.collectAsState()
    val dualPaneSplit by viewModel.dualPaneSplit.collectAsState()
    val secondaryDir by viewModel.secondaryDirectory.collectAsState()
    val secondaryFileItems by viewModel.secondaryFileItems.collectAsState()
    val secondaryLoading by viewModel.secondaryLoading.collectAsState()
    val activePaneIndex by viewModel.activePaneIndex.collectAsState()

    // Selection & Clipboard
    val clipboard by viewModel.clipboard.collectAsState()
    val selectedItems by viewModel.selectedItems.collectAsState()
    val isMultiSelect by viewModel.isMultiSelectMode.collectAsState()
    val isGridView by viewModel.isGridView.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val operationProgress by viewModel.operationProgress.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()

    var isSearching by remember { mutableStateOf(false) }
    var showSortDialog by remember { mutableStateOf(false) }
    var showMoreMenu by remember { mutableStateOf(false) }

    var showCreateFolderDialog by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }
    var createInSecondaryPane by remember { mutableStateOf(false) }

    var showCreateFileDialog by remember { mutableStateOf(false) }
    var newFileName by remember { mutableStateOf("") }

    var showRenameDialog by remember { mutableStateOf<FileItem?>(null) }
    var renameInput by remember { mutableStateOf("") }

    var showDeleteConfirmDialog by remember { mutableStateOf(false) }
    var compressTargetFiles by remember { mutableStateOf<List<File>?>(null) }
    var compressInitialName by remember { mutableStateOf("archive.zip") }
    var compressInitialDir by remember { mutableStateOf(currentDir) }
    var extractFolderPickerTarget by remember { mutableStateOf<File?>(null) }
    var extractPasswordPrompt by remember { mutableStateOf<Pair<File, File>?>(null) }
    var extractPasswordInput by remember { mutableStateOf("") }

    var showInfoDialog by remember { mutableStateOf<FileItem?>(null) }
    var infoHashText by remember { mutableStateOf<String?>(null) }
    var isCalculatingInfoHash by remember { mutableStateOf(false) }

    var showConnectionsDialog by remember { mutableStateOf(false) }

    // Cross-window Drag & Drop state (between independent windows or Dual Pane)
    val windowInstanceId = remember { UUID.randomUUID().toString() }
    var pendingCrossWindowDrop by remember { mutableStateOf<Pair<List<File>, File>?>(null) }
    var isFabExpanded by remember { mutableStateOf(false) }

    val safLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            viewModel.handleSafUri(uri)
        }
    }

    LaunchedEffect(statusMessage) {
        statusMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearStatusMessage()
        }
    }

    var lastBackPressTime by remember { mutableLongStateOf(0L) }

    BackHandler {
        if (drawerState.isOpen) {
            coroutineScope.launch { drawerState.close() }
        } else if (isSearching) {
            isSearching = false
            viewModel.setSearchQuery("")
        } else if (isMultiSelect) {
            viewModel.clearSelection()
        } else {
            val handled = viewModel.navigateBack()
            if (!handled) {
                val now = System.currentTimeMillis()
                if (now - lastBackPressTime < 2000L) {
                    (context as? android.app.Activity)?.finishAffinity()
                } else {
                    lastBackPressTime = now
                    android.widget.Toast.makeText(
                        context,
                        "Vuốt lần nữa để thoát ứng dụng",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    val primaryDisplayName = remember(currentDir) {
        val rootPath = android.os.Environment.getExternalStorageDirectory().absolutePath
        if (currentDir.absolutePath == rootPath) {
            android.os.Build.MODEL.ifEmpty { "MNA-AL00" }
        } else {
            currentDir.name.ifEmpty { android.os.Build.MODEL.ifEmpty { "MNA-AL00" } }
        }
    }

    val displayedItems = remember(fileItems, searchQuery) {
        if (searchQuery.isBlank()) fileItems
        else fileItems.filter { it.name.contains(searchQuery, ignoreCase = true) }
    }

    val displayedSecondaryItems = remember(secondaryFileItems, searchQuery) {
        if (searchQuery.isBlank()) secondaryFileItems
        else secondaryFileItems.filter { it.name.contains(searchQuery, ignoreCase = true) }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = CharcoalSurface,
                drawerContentColor = TextPrimary
            ) {
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Folder,
                        contentDescription = null,
                        tint = Color(0xFFFFB300),
                        modifier = Modifier.size(32.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "FILE MANAGER PRO",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Text(
                            text = "Advanced Data Explorer",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextMuted
                        )
                    }
                }

                HorizontalDivider(color = DocumentsUIDivider, modifier = Modifier.padding(vertical = 8.dp))

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Home, null, tint = ElectricBlue) },
                    label = { Text("Trang chủ tổng quan", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        viewModel.navigateTo(ScreenDestination.Home)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Build, null, tint = CyanAccent) },
                    label = { Text("Công cụ phân tích bộ nhớ", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        viewModel.navigateTo(ScreenDestination.Analyzer)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                HorizontalDivider(color = DocumentsUIDivider, modifier = Modifier.padding(vertical = 8.dp))

                Text(
                    text = "VỊ TRÍ BỘ NHỚ",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextMuted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    fontWeight = FontWeight.Bold
                )

                storageVolumes.forEach { vol ->
                    NavigationDrawerItem(
                        icon = { Icon(if (vol.isRemovable) Icons.Default.SdCard else Icons.Default.PhoneAndroid, null, tint = if (vol.isRemovable) CyanAccent else Color(0xFFFFB300)) },
                        label = {
                            Column {
                                Text(if (vol.isPrimary) (android.os.Build.MODEL.ifEmpty { vol.name }) else vol.name, color = TextPrimary)
                                Text(
                                    "${FileItem.formatBytes(vol.freeBytes)} trống / ${FileItem.formatBytes(vol.totalBytes)}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TextMuted
                                )
                            }
                        },
                        selected = currentDir.absolutePath == vol.path,
                        onClick = {
                            viewModel.openStorageRoot(File(vol.path))
                            coroutineScope.launch { drawerState.close() }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                }

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.AddCircleOutline, null, tint = ElectricBlue) },
                    label = { Text("Mở thêm thư mục SAF / USB OTG", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        safLauncher.launch(null)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                HorizontalDivider(color = DocumentsUIDivider, modifier = Modifier.padding(vertical = 8.dp))

                Text(
                    text = "TÍNH NĂNG NÂNG CAO",
                    style = MaterialTheme.typography.labelSmall,
                    color = TextMuted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    fontWeight = FontWeight.Bold
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Launch, null, tint = CyanAccent) },
                    label = { Text("Mở cửa sổ mới (2 ứng dụng độc lập)", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        openNewAppWindow(context, currentDir.absolutePath)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Splitscreen, null, tint = ElectricBlue) },
                    label = { Text("Mở chia đôi màn hình (Dual Pane)", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        viewModel.navigateTo(ScreenDestination.DualPane)
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Wifi, null, tint = ColorSuccessGreen) },
                    label = { Text("Kết nối & Chia sẻ tệp Wi-Fi", color = TextPrimary) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        showConnectionsDialog = true
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
            }
        }
    ) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbarHostState) },
            topBar = {
                TopAppBar(
                    windowInsets = WindowInsets.statusBars,
                    navigationIcon = {
                        if (isMultiSelect) {
                            IconButton(onClick = { viewModel.clearSelection() }) {
                                Icon(Icons.Default.Close, contentDescription = "Đóng", tint = TextPrimary)
                            }
                        } else {
                            IconButton(onClick = {
                                coroutineScope.launch { drawerState.open() }
                            }) {
                                Icon(Icons.Default.Menu, contentDescription = "Menu ngăn kéo", tint = TextPrimary)
                            }
                        }
                    },
                    title = {
                        if (isSearching) {
                            TextField(
                                value = searchQuery,
                                onValueChange = { viewModel.setSearchQuery(it) },
                                placeholder = { Text("Tìm kiếm tệp...", color = TextMuted) },
                                singleLine = true,
                                colors = TextFieldDefaults.colors(
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                    focusedTextColor = TextPrimary,
                                    unfocusedTextColor = TextPrimary,
                                    cursorColor = ElectricBlue
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                        } else if (isMultiSelect) {
                            Text(
                                text = "Đã chọn ${selectedItems.size} mục",
                                color = TextPrimary,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        } else {
                            Column(
                                modifier = Modifier.clickable {
                                    coroutineScope.launch { drawerState.open() }
                                }
                            ) {
                                val currentTitle = activeCategoryTitle ?: if (currentDir.absolutePath == android.os.Environment.getExternalStorageDirectory().absolutePath) primaryDisplayName else currentDir.name
                                Text(
                                    text = currentTitle,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                                Text(
                                    text = if (activeCategoryTitle != null) "Bộ lọc danh mục" else currentDir.absolutePath,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = CyanAccent,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    },
                    actions = {
                        if (isMultiSelect) {
                            IconButton(onClick = { viewModel.setClipboard(ClipboardAction.COPY) }) {
                                Icon(Icons.Default.ContentCopy, contentDescription = "Sao chép", tint = TextPrimary)
                            }
                            IconButton(onClick = { viewModel.setClipboard(ClipboardAction.CUT) }) {
                                Icon(Icons.Default.ContentCut, contentDescription = "Cắt", tint = TextPrimary)
                            }
                            IconButton(onClick = { showDeleteConfirmDialog = true }) {
                                Icon(Icons.Default.Delete, contentDescription = "Xóa", tint = ColorErrorRed)
                            }
                            IconButton(onClick = {
                                val files = selectedItems.map { File(it.path) }
                                if (files.isNotEmpty()) {
                                    compressInitialName = if (files.size == 1) "${files.first().nameWithoutExtension.ifEmpty { files.first().name }}.zip" else "${currentDir.name.ifEmpty { "archive" }}.zip"
                                    compressInitialDir = currentDir
                                    compressTargetFiles = files
                                }
                            }) {
                                Icon(Icons.Default.FolderZip, contentDescription = "Tạo tệp lưu trữ", tint = CyanAccent)
                            }
                            IconButton(onClick = {
                                if (selectedItems.size == 1) {
                                    val item = selectedItems.first()
                                    FileUtils.shareFile(context, File(item.path))
                                }
                            }) {
                                Icon(Icons.Default.Share, contentDescription = "Chia sẻ", tint = TextPrimary)
                            }
                        } else {
                            // Search toggle
                            IconButton(onClick = { isSearching = !isSearching }) {
                                Icon(
                                    if (isSearching) Icons.Default.Close else Icons.Default.Search,
                                    contentDescription = "Tìm kiếm",
                                    tint = TextPrimary
                                )
                            }
                            // Direct View Mode toggle (Grid / List) in TopBar like ZArchiver
                            IconButton(onClick = { viewModel.toggleViewMode() }) {
                                Icon(
                                    if (isGridView) Icons.Default.ViewList else Icons.Default.GridView,
                                    contentDescription = if (isGridView) "Chuyển sang dạng Danh sách" else "Chuyển sang dạng Lưới",
                                    tint = TextPrimary
                                )
                            }
                            // Direct Sort button in TopBar like ZArchiver
                            IconButton(onClick = { showSortDialog = true }) {
                                Icon(
                                    Icons.AutoMirrored.Filled.Sort,
                                    contentDescription = "Sắp xếp",
                                    tint = TextPrimary
                                )
                            }
                            Box {
                                IconButton(onClick = { showMoreMenu = true }) {
                                    Icon(Icons.Default.MoreVert, contentDescription = "Tùy chọn khác", tint = TextPrimary)
                                }
                                DropdownMenu(
                                    expanded = showMoreMenu,
                                    onDismissRequest = { showMoreMenu = false },
                                    modifier = Modifier.background(CharcoalSurfaceVariant)
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Mở cửa sổ mới (2 ứng dụng độc lập)", color = CyanAccent) },
                                        leadingIcon = { Icon(Icons.Default.Launch, null, tint = CyanAccent) },
                                        onClick = {
                                            showMoreMenu = false
                                            openNewAppWindow(context, currentDir.absolutePath)
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text(if (isDualPane) "Tắt chia đôi màn hình" else "Chia đôi màn hình (Dual Pane)", color = ElectricBlue) },
                                        leadingIcon = { Icon(Icons.Default.Splitscreen, null, tint = ElectricBlue) },
                                        onClick = {
                                            showMoreMenu = false
                                            viewModel.toggleDualPane()
                                        }
                                    )
                                    if (isDualPane) {
                                        DropdownMenuItem(
                                            text = { Text("Đổi chiều chia đôi (Dọc / Ngang)", color = TextPrimary) },
                                            leadingIcon = { Icon(Icons.Default.ScreenRotation, null, tint = TextPrimary) },
                                            onClick = {
                                                showMoreMenu = false
                                                viewModel.toggleDualPaneSplit()
                                            }
                                        )
                                    }
                                    HorizontalDivider(color = DocumentsUIDivider)
                                    DropdownMenuItem(
                                        text = { Text("Tạo thư mục mới", color = TextPrimary) },
                                        leadingIcon = { Icon(Icons.Default.CreateNewFolder, null, tint = Color(0xFFFFB300)) },
                                        onClick = {
                                            showMoreMenu = false
                                            createInSecondaryPane = false
                                            newFolderName = ""
                                            showCreateFolderDialog = true
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Tạo tệp mới", color = TextPrimary) },
                                        leadingIcon = { Icon(Icons.Default.NoteAdd, null, tint = ElectricBlue) },
                                        onClick = {
                                            showMoreMenu = false
                                            createInSecondaryPane = false
                                            newFileName = ""
                                            showCreateFileDialog = true
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Tạo tệp lưu trữ (Nén)...", color = CyanAccent) },
                                        leadingIcon = { Icon(Icons.Default.FolderZip, null, tint = CyanAccent) },
                                        onClick = {
                                            showMoreMenu = false
                                            val files = selectedItems.map { File(it.path) }.ifEmpty { displayedItems.map { File(it.path) } }
                                            if (files.isNotEmpty()) {
                                                compressInitialName = if (files.size == 1) "${files.first().nameWithoutExtension.ifEmpty { files.first().name }}.zip" else "${currentDir.name.ifEmpty { "archive" }}.zip"
                                                compressInitialDir = currentDir
                                                compressTargetFiles = files
                                            }
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Hiện/Ẩn tệp ẩn", color = TextPrimary) },
                                        leadingIcon = { Icon(Icons.Default.Visibility, null, tint = TextPrimary) },
                                        onClick = {
                                            showMoreMenu = false
                                            viewModel.toggleShowHiddenFiles()
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Kết nối & Chia sẻ Wi-Fi", color = ColorSuccessGreen) },
                                        leadingIcon = { Icon(Icons.Default.Wifi, null, tint = ColorSuccessGreen) },
                                        onClick = {
                                            showMoreMenu = false
                                            showConnectionsDialog = true
                                        }
                                    )
                                    DropdownMenuItem(
                                        text = { Text("Chọn tất cả", color = TextPrimary) },
                                        leadingIcon = { Icon(Icons.Default.SelectAll, null, tint = TextPrimary) },
                                        onClick = {
                                            showMoreMenu = false
                                            viewModel.selectAll()
                                        }
                                    )
                                }
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = DocumentsUIDarkBg)
                )
            },
            floatingActionButton = {
                if (!isMultiSelect) {
                    Column(
                        horizontalAlignment = Alignment.End,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        AnimatedVisibility(
                            visible = isFabExpanded,
                            enter = fadeIn() + expandVertically(),
                            exit = fadeOut() + shrinkVertically()
                        ) {
                            Column(
                                horizontalAlignment = Alignment.End,
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                SmallFloatingActionButton(
                                    onClick = {
                                        isFabExpanded = false
                                        createInSecondaryPane = false
                                        newFolderName = ""
                                        showCreateFolderDialog = true
                                    },
                                    containerColor = Color(0xFFFFB300),
                                    contentColor = Color.Black
                                ) {
                                    Icon(Icons.Default.CreateNewFolder, contentDescription = "Thư mục mới")
                                }

                                SmallFloatingActionButton(
                                    onClick = {
                                        isFabExpanded = false
                                        createInSecondaryPane = false
                                        newFileName = ""
                                        showCreateFileDialog = true
                                    },
                                    containerColor = ElectricBlue,
                                    contentColor = Color.White
                                ) {
                                    Icon(Icons.Default.NoteAdd, contentDescription = "Tệp mới")
                                }

                                SmallFloatingActionButton(
                                    onClick = {
                                        isFabExpanded = false
                                        val files = selectedItems.map { File(it.path) }.ifEmpty { displayedItems.map { File(it.path) } }
                                        if (files.isNotEmpty()) {
                                            compressInitialName = if (files.size == 1) "${files.first().nameWithoutExtension.ifEmpty { files.first().name }}.zip" else "${currentDir.name.ifEmpty { "archive" }}.zip"
                                            compressInitialDir = currentDir
                                            compressTargetFiles = files
                                        }
                                    },
                                    containerColor = CyanAccent,
                                    contentColor = Color.Black
                                ) {
                                    Icon(Icons.Default.FolderZip, contentDescription = "Tạo tệp lưu trữ")
                                }
                            }
                        }

                        FloatingActionButton(
                            onClick = { isFabExpanded = !isFabExpanded },
                            containerColor = if (isFabExpanded) CharcoalSurfaceHighlight else ElectricBlue,
                            contentColor = Color.White,
                            shape = CircleShape
                        ) {
                            Icon(
                                if (isFabExpanded) Icons.Default.Close else Icons.Default.Add,
                                contentDescription = "Thao tác tạo mới",
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
            },
            containerColor = DocumentsUIDarkBg,
            contentWindowInsets = WindowInsets.navigationBars
        ) { paddingValues ->
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .windowInsetsPadding(WindowInsets.displayCutout.only(WindowInsetsSides.Horizontal))
            ) {
                val isLandscape = maxWidth > maxHeight && maxWidth >= 560.dp

                LaunchedEffect(isLandscape, isDualPane) {
                    if (isDualPane) {
                        viewModel.syncDualPaneSplitForOrientation(isLandscape)
                    }
                }

                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                // Operation progress bar
                if (operationProgress.isRunning) {
                    LinearProgressIndicator(
                        progress = { operationProgress.progress },
                        modifier = Modifier.fillMaxWidth(),
                        color = ElectricBlue
                    )
                }

                // Horizontal Category Filter Chips Row (drawn close to status bar)
                if (activeCategoryTitle == null && !isDualPane) {
                    CategoryFilterRow(
                        onSelectCategory = { type, title ->
                            viewModel.loadCategoryFiles(type, title)
                        }
                    )
                } else if (activeCategoryTitle != null) {
                    // Active category filter banner
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CharcoalSurfaceVariant)
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.FilterList, contentDescription = null, tint = ElectricBlue, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Đang lọc: $activeCategoryTitle (${displayedItems.size} mục)",
                                color = TextPrimary,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        IconButton(
                            onClick = {
                                viewModel.loadDirectory(currentDir)
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Xóa lọc", tint = TextMuted, modifier = Modifier.size(16.dp))
                        }
                    }
                }

                // Multi-select Drag & Drop Pill (Nhấc lên & Kéo sang cửa sổ khác)
                if (selectedItems.isNotEmpty()) {
                    MultiSelectDragPillBar(
                        selectedItems = selectedItems.toList(),
                        windowInstanceId = windowInstanceId
                    )
                }

                // Breadcrumb Path Bar (if in subfolder)
                if (activeCategoryTitle == null) {
                    PathBreadcrumbsBar(
                        currentDir = currentDir,
                        onNavigateTo = { viewModel.enterDirectory(it) }
                    )
                }

                // 4. Main Body: Single Pane or Dual-Pane Split Screen
                Box(modifier = Modifier.weight(1f)) {
                    if (isDualPane) {
                        // Two completely separate independent file explorer panes
                        if (dualPaneSplit == DualPaneSplit.VERTICAL) {
                            Row(modifier = Modifier.fillMaxSize()) {
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight()
                                        .border(
                                            width = if (activePaneIndex == 0) 1.5.dp else 0.dp,
                                            color = if (activePaneIndex == 0) ElectricBlue else Color.Transparent
                                        )
                                ) {
                                    PaneContent(
                                        paneIndex = 0,
                                        dir = currentDir,
                                        items = displayedItems,
                                        isLoading = isLoading,
                                        isGridView = isGridView,
                                        selectedItems = selectedItems,
                                        clipboard = clipboard,
                                        onEnterDir = { viewModel.enterDirectory(it) },
                                        onOpenFile = { viewModel.openFile(it) },
                                        onToggleSelect = { viewModel.toggleSelectItem(it) },
                                        onLongClick = { viewModel.toggleSelectItem(it) },
                                        onFocus = { viewModel.setActivePane(0) },
                                        onTransferToOtherPane = { item, isMove ->
                                            viewModel.transferFileBetweenPanes(item, secondaryDir, isMove)
                                        },
                                        otherPaneDirName = secondaryDir.name.ifEmpty { "Cửa sổ 2" },
                                        onShowInfo = { item ->
                                            showInfoDialog = item
                                            isCalculatingInfoHash = false
                                            infoHashText = null
                                        },
                                        onRename = { item ->
                                            showRenameDialog = item
                                            renameInput = item.name
                                        },
                                        onDelete = { item -> viewModel.deleteSingleFile(item) },
                                        onCompress = { item ->
                                            val f = File(item.path)
                                            compressInitialName = "${f.nameWithoutExtension.ifEmpty { f.name }}.zip"
                                            compressInitialDir = f.parentFile ?: currentDir
                                            compressTargetFiles = listOf(f)
                                        },
                                        onExtractHere = { item ->
                                            val arc = File(item.path)
                                            val out = File(arc.parentFile ?: currentDir, arc.nameWithoutExtension)
                                            viewModel.extractArchiveToDirectory(arc, out) {
                                                extractPasswordInput = ""
                                                extractPasswordPrompt = Pair(arc, out)
                                            }
                                        },
                                        onExtractToFolder = { item ->
                                            extractFolderPickerTarget = File(item.path)
                                        },
                                        windowInstanceId = windowInstanceId,
                                        onCrossWindowDrop = { paths, targetDir ->
                                            val validFiles = paths.map(::File).filter { it.exists() }
                                            if (validFiles.isNotEmpty()) {
                                                pendingCrossWindowDrop = Pair(validFiles, targetDir)
                                            }
                                        }
                                    )
                                }

                                VerticalDivider(color = DocumentsUIDivider, thickness = 2.dp)

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxHeight()
                                        .border(
                                            width = if (activePaneIndex == 1) 1.5.dp else 0.dp,
                                            color = if (activePaneIndex == 1) ElectricBlue else Color.Transparent
                                        )
                                ) {
                                    PaneContent(
                                        paneIndex = 1,
                                        dir = secondaryDir,
                                        items = displayedSecondaryItems,
                                        isLoading = secondaryLoading,
                                        isGridView = isGridView,
                                        selectedItems = selectedItems,
                                        clipboard = clipboard,
                                        onEnterDir = { viewModel.enterSecondaryDirectory(it) },
                                        onOpenFile = { viewModel.openFile(it) },
                                        onToggleSelect = { viewModel.toggleSelectItem(it) },
                                        onLongClick = { viewModel.toggleSelectItem(it) },
                                        onFocus = { viewModel.setActivePane(1) },
                                        onTransferToOtherPane = { item, isMove ->
                                            viewModel.transferFileBetweenPanes(item, currentDir, isMove)
                                        },
                                        otherPaneDirName = currentDir.name.ifEmpty { "Cửa sổ 1" },
                                        onShowInfo = { item ->
                                            showInfoDialog = item
                                            isCalculatingInfoHash = false
                                            infoHashText = null
                                        },
                                        onRename = { item ->
                                            showRenameDialog = item
                                            renameInput = item.name
                                        },
                                        onDelete = { item -> viewModel.deleteSingleFile(item) },
                                        onCompress = { item ->
                                            val f = File(item.path)
                                            compressInitialName = "${f.nameWithoutExtension.ifEmpty { f.name }}.zip"
                                            compressInitialDir = f.parentFile ?: secondaryDir
                                            compressTargetFiles = listOf(f)
                                        },
                                        onExtractHere = { item ->
                                            val arc = File(item.path)
                                            val out = File(arc.parentFile ?: secondaryDir, arc.nameWithoutExtension)
                                            viewModel.extractArchiveToDirectory(arc, out) {
                                                extractPasswordInput = ""
                                                extractPasswordPrompt = Pair(arc, out)
                                            }
                                        },
                                        onExtractToFolder = { item ->
                                            extractFolderPickerTarget = File(item.path)
                                        },
                                        windowInstanceId = windowInstanceId,
                                        onCrossWindowDrop = { paths, targetDir ->
                                            val validFiles = paths.map(::File).filter { it.exists() }
                                            if (validFiles.isNotEmpty()) {
                                                pendingCrossWindowDrop = Pair(validFiles, targetDir)
                                            }
                                        }
                                    )
                                }
                            }
                        } else {
                            Column(modifier = Modifier.fillMaxSize()) {
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                        .border(
                                            width = if (activePaneIndex == 0) 1.5.dp else 0.dp,
                                            color = if (activePaneIndex == 0) ElectricBlue else Color.Transparent
                                        )
                                ) {
                                    PaneContent(
                                        paneIndex = 0,
                                        dir = currentDir,
                                        items = displayedItems,
                                        isLoading = isLoading,
                                        isGridView = isGridView,
                                        selectedItems = selectedItems,
                                        clipboard = clipboard,
                                        onEnterDir = { viewModel.enterDirectory(it) },
                                        onOpenFile = { viewModel.openFile(it) },
                                        onToggleSelect = { viewModel.toggleSelectItem(it) },
                                        onLongClick = { viewModel.toggleSelectItem(it) },
                                        onFocus = { viewModel.setActivePane(0) },
                                        onTransferToOtherPane = { item, isMove ->
                                            viewModel.transferFileBetweenPanes(item, secondaryDir, isMove)
                                        },
                                        otherPaneDirName = secondaryDir.name.ifEmpty { "Cửa sổ 2" },
                                        onShowInfo = { item ->
                                            showInfoDialog = item
                                            isCalculatingInfoHash = false
                                            infoHashText = null
                                        },
                                        onRename = { item ->
                                            showRenameDialog = item
                                            renameInput = item.name
                                        },
                                        onDelete = { item -> viewModel.deleteSingleFile(item) },
                                        onCompress = { item ->
                                            val f = File(item.path)
                                            compressInitialName = "${f.nameWithoutExtension.ifEmpty { f.name }}.zip"
                                            compressInitialDir = f.parentFile ?: currentDir
                                            compressTargetFiles = listOf(f)
                                        },
                                        onExtractHere = { item ->
                                            val arc = File(item.path)
                                            val out = File(arc.parentFile ?: currentDir, arc.nameWithoutExtension)
                                            viewModel.extractArchiveToDirectory(arc, out) {
                                                extractPasswordInput = ""
                                                extractPasswordPrompt = Pair(arc, out)
                                            }
                                        },
                                        onExtractToFolder = { item ->
                                            extractFolderPickerTarget = File(item.path)
                                        },
                                        windowInstanceId = windowInstanceId,
                                        onCrossWindowDrop = { paths, targetDir ->
                                            val validFiles = paths.map(::File).filter { it.exists() }
                                            if (validFiles.isNotEmpty()) {
                                                pendingCrossWindowDrop = Pair(validFiles, targetDir)
                                            }
                                        }
                                    )
                                }

                                HorizontalDivider(color = DocumentsUIDivider, thickness = 2.dp)

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth()
                                        .border(
                                            width = if (activePaneIndex == 1) 1.5.dp else 0.dp,
                                            color = if (activePaneIndex == 1) ElectricBlue else Color.Transparent
                                        )
                                ) {
                                    PaneContent(
                                        paneIndex = 1,
                                        dir = secondaryDir,
                                        items = displayedSecondaryItems,
                                        isLoading = secondaryLoading,
                                        isGridView = isGridView,
                                        selectedItems = selectedItems,
                                        clipboard = clipboard,
                                        onEnterDir = { viewModel.enterSecondaryDirectory(it) },
                                        onOpenFile = { viewModel.openFile(it) },
                                        onToggleSelect = { viewModel.toggleSelectItem(it) },
                                        onLongClick = { viewModel.toggleSelectItem(it) },
                                        onFocus = { viewModel.setActivePane(1) },
                                        onTransferToOtherPane = { item, isMove ->
                                            viewModel.transferFileBetweenPanes(item, currentDir, isMove)
                                        },
                                        otherPaneDirName = currentDir.name.ifEmpty { "Cửa sổ 1" },
                                        onShowInfo = { item ->
                                            showInfoDialog = item
                                            isCalculatingInfoHash = false
                                            infoHashText = null
                                        },
                                        onRename = { item ->
                                            showRenameDialog = item
                                            renameInput = item.name
                                        },
                                        onDelete = { item -> viewModel.deleteSingleFile(item) },
                                        onCompress = { item ->
                                            val f = File(item.path)
                                            compressInitialName = "${f.nameWithoutExtension.ifEmpty { f.name }}.zip"
                                            compressInitialDir = f.parentFile ?: secondaryDir
                                            compressTargetFiles = listOf(f)
                                        },
                                        onExtractHere = { item ->
                                            val arc = File(item.path)
                                            val out = File(arc.parentFile ?: secondaryDir, arc.nameWithoutExtension)
                                            viewModel.extractArchiveToDirectory(arc, out) {
                                                extractPasswordInput = ""
                                                extractPasswordPrompt = Pair(arc, out)
                                            }
                                        },
                                        onExtractToFolder = { item ->
                                            extractFolderPickerTarget = File(item.path)
                                        },
                                        windowInstanceId = windowInstanceId,
                                        onCrossWindowDrop = { paths, targetDir ->
                                            val validFiles = paths.map(::File).filter { it.exists() }
                                            if (validFiles.isNotEmpty()) {
                                                pendingCrossWindowDrop = Pair(validFiles, targetDir)
                                            }
                                        }
                                    )
                                }
                            }
                        }
                    } else {
                        // Standard Single Pane (Full DocumentsUI style)
                        PaneContent(
                            paneIndex = 0,
                            dir = currentDir,
                            items = displayedItems,
                            isLoading = isLoading,
                            isGridView = isGridView,
                            selectedItems = selectedItems,
                            clipboard = clipboard,
                            onEnterDir = { viewModel.enterDirectory(it) },
                            onOpenFile = { viewModel.openFile(it) },
                            onToggleSelect = { viewModel.toggleSelectItem(it) },
                            onLongClick = { viewModel.toggleSelectItem(it) },
                            onFocus = { },
                            onTransferToOtherPane = { _, _ -> },
                            otherPaneDirName = "",
                            onShowInfo = { item ->
                                showInfoDialog = item
                                isCalculatingInfoHash = false
                                infoHashText = null
                            },
                            onRename = { item ->
                                showRenameDialog = item
                                renameInput = item.name
                            },
                            onDelete = { item -> viewModel.deleteSingleFile(item) },
                            onCompress = { item ->
                                val f = File(item.path)
                                compressInitialName = "${f.nameWithoutExtension.ifEmpty { f.name }}.zip"
                                compressInitialDir = f.parentFile ?: currentDir
                                compressTargetFiles = listOf(f)
                            },
                            onExtractHere = { item ->
                                val arc = File(item.path)
                                val out = File(arc.parentFile ?: currentDir, arc.nameWithoutExtension)
                                viewModel.extractArchiveToDirectory(arc, out) {
                                    extractPasswordInput = ""
                                    extractPasswordPrompt = Pair(arc, out)
                                }
                            },
                            onExtractToFolder = { item ->
                                extractFolderPickerTarget = File(item.path)
                            },
                            windowInstanceId = windowInstanceId,
                            onCrossWindowDrop = { paths, targetDir ->
                                val validFiles = paths.map(::File).filter { it.exists() }
                                if (validFiles.isNotEmpty()) {
                                    pendingCrossWindowDrop = Pair(validFiles, targetDir)
                                }
                            }
                        )
                    }

                    // Floating Clipboard Bar (Paste / Cancel)
                    if (clipboard != null && !isMultiSelect) {
                        Surface(
                            shape = RoundedCornerShape(24.dp),
                            color = CharcoalSurfaceHighlight,
                            shadowElevation = 8.dp,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(16.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${if (clipboard?.action == ClipboardAction.COPY) "Sao chép" else "Di chuyển"} (${clipboard?.items?.size} tệp)",
                                    color = TextPrimary,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Button(
                                    onClick = { viewModel.pasteClipboard() },
                                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                                ) {
                                    Icon(Icons.Default.ContentPaste, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Dán vào đây")
                                }
                                IconButton(onClick = { viewModel.clearClipboard() }) {
                                    Icon(Icons.Default.Close, contentDescription = "Hủy", tint = TextMuted)
                                }
                            }
                        }
                    }
                }
            }
            }
        }
    }

    // --- Dialogs ---

    // 1. Wi-Fi File Sharing & Connections Dialog
    if (showConnectionsDialog) {
        var isServerOn by remember { mutableStateOf(NetworkSharingManager.isServerRunning) }
        val ipAddress = remember { NetworkSharingManager.getLocalIpAddress(context) }
        val serverUrl = "http://$ipAddress:8080"

        AlertDialog(
            onDismissRequest = { showConnectionsDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Wifi, contentDescription = null, tint = ColorSuccessGreen)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Kết nối & Chia sẻ Wi-Fi", color = TextPrimary)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Truyền tệp không dây giữa điện thoại và máy tính (PC / Laptop) qua cùng mạng Wi-Fi cục bộ.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = CharcoalBackground,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (isServerOn) "Máy chủ Web: ĐANG CHẠY" else "Máy chủ Web: ĐÃ TẮT",
                                    color = if (isServerOn) ColorSuccessGreen else TextMuted,
                                    fontWeight = FontWeight.Bold,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                                Switch(
                                    checked = isServerOn,
                                    onCheckedChange = { checked ->
                                        if (checked) {
                                            val started = NetworkSharingManager.startServer(currentDir, 8080)
                                            isServerOn = started
                                        } else {
                                            NetworkSharingManager.stopServer()
                                            isServerOn = false
                                        }
                                    }
                                )
                            }

                            if (isServerOn) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Nhập địa chỉ sau vào trình duyệt PC/Laptop:", style = MaterialTheme.typography.labelSmall, color = TextMuted)
                                Text(
                                    text = serverUrl,
                                    color = CyanAccent,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text("Đang chia sẻ thư mục: /${currentDir.name.ifEmpty { "Bộ nhớ trong" }}", style = MaterialTheme.typography.labelSmall, color = TextMuted)
                            }
                        }
                    }

                    HorizontalDivider(color = DocumentsUIDivider)

                    Text("Kết nối thiết bị ngoài:", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = TextPrimary)
                    OutlinedButton(
                        onClick = {
                            showConnectionsDialog = false
                            safLauncher.launch(null)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Usb, contentDescription = null, tint = ElectricBlue)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Kết nối Thẻ nhớ ngoài / USB OTG (SAF)", color = TextPrimary)
                    }

                    OutlinedButton(
                        onClick = {
                            showConnectionsDialog = false
                            openNewAppWindow(context, currentDir.absolutePath)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.Launch, contentDescription = null, tint = CyanAccent)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Mở thêm cửa sổ ứng dụng mới", color = TextPrimary)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showConnectionsDialog = false }) {
                    Text("Đóng", color = ElectricBlue)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 2. Sort Dialog
    if (showSortDialog) {
        AlertDialog(
            onDismissRequest = { showSortDialog = false },
            title = { Text("Sắp xếp tệp theo", color = TextPrimary) },
            text = {
                Column {
                    listOf(
                        "Tên (A đến Z)" to SortOption(SortField.NAME, SortOrder.ASCENDING),
                        "Tên (Z đến A)" to SortOption(SortField.NAME, SortOrder.DESCENDING),
                        "Kích thước (Lớn nhất)" to SortOption(SortField.SIZE, SortOrder.DESCENDING),
                        "Kích thước (Nhỏ nhất)" to SortOption(SortField.SIZE, SortOrder.ASCENDING),
                        "Ngày sửa đổi (Mới nhất)" to SortOption(SortField.DATE, SortOrder.DESCENDING),
                        "Ngày sửa đổi (Cũ nhất)" to SortOption(SortField.DATE, SortOrder.ASCENDING),
                        "Loại định dạng" to SortOption(SortField.TYPE, SortOrder.ASCENDING)
                    ).forEach { (label, option) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.setSortOption(option)
                                    showSortDialog = false
                                }
                                .padding(vertical = 10.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = viewModel.sortOption.value == option,
                                onClick = {
                                    viewModel.setSortOption(option)
                                    showSortDialog = false
                                }
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(label, color = TextPrimary, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showSortDialog = false }) {
                    Text("Đóng", color = ElectricBlue)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 3. Create Folder Dialog
    if (showCreateFolderDialog) {
        AlertDialog(
            onDismissRequest = { showCreateFolderDialog = false },
            title = { Text("Tạo thư mục mới", color = TextPrimary) },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    label = { Text("Tên thư mục") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ElectricBlue,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newFolderName.isNotBlank()) {
                            viewModel.createFolder(newFolderName.trim(), createInSecondaryPane)
                            showCreateFolderDialog = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Tạo")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFolderDialog = false }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 4. Create File Dialog (e.g. .ts, .txs, .css, .bat, .dat)
    if (showCreateFileDialog) {
        AlertDialog(
            onDismissRequest = { showCreateFileDialog = false },
            title = { Text("Tạo tệp tin mới", color = TextPrimary) },
            text = {
                Column {
                    Text("Hỗ trợ mọi định dạng: .ts, .txs, .css, .bat, .dat, .txt, .json...", style = MaterialTheme.typography.labelSmall, color = TextMuted)
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newFileName,
                        onValueChange = { newFileName = it },
                        placeholder = { Text("ví dụ: script.ts, style.css, data.dat") },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ElectricBlue,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newFileName.isNotBlank()) {
                            viewModel.createFile(newFileName.trim(), createInSecondaryPane)
                            showCreateFileDialog = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Tạo")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateFileDialog = false }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 5. Rename Dialog
    showRenameDialog?.let { item ->
        AlertDialog(
            onDismissRequest = { showRenameDialog = null },
            title = { Text("Đổi tên tệp", color = TextPrimary) },
            text = {
                OutlinedTextField(
                    value = renameInput,
                    onValueChange = { renameInput = it },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ElectricBlue,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (renameInput.isNotBlank()) {
                            viewModel.renameFile(item, renameInput.trim())
                            showRenameDialog = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Đổi tên")
                }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = null }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 6. Delete Confirm Dialog
    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            title = { Text("Xác nhận xóa", color = ColorErrorRed) },
            text = { Text("Bạn có chắc chắn muốn xóa ${selectedItems.size} mục đã chọn vĩnh viễn?", color = TextPrimary) },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteSelectedItems()
                        showDeleteConfirmDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ColorErrorRed)
                ) {
                    Text("Xóa vĩnh viễn")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmDialog = false }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 7. Full-featured Archive Creator Dialog (ZArchiver Pro style) & Extract Folder Picker
    compressTargetFiles?.let { filesToCompress ->
        val firstArchive = filesToCompress.firstOrNull { f ->
            !f.isDirectory && FileUtils.detectFileType(f) == FileType.ARCHIVE
        }
        CreateArchiveDialog(
            initialArchiveName = compressInitialName,
            initialDestinationDir = compressInitialDir,
            selectedItemCount = filesToCompress.size,
            onDismiss = { compressTargetFiles = null },
            onConfirmCompress = { config ->
                compressTargetFiles = null
                viewModel.createArchiveFromFiles(filesToCompress, config)
            },
            onSwitchToExtractOtherFolder = if (firstArchive != null) {
                { extractFolderPickerTarget = firstArchive }
            } else null
        )
    }

    extractFolderPickerTarget?.let { archiveFile ->
        FolderPickerDialog(
            title = "Chọn thư mục giải nén ${archiveFile.name}",
            initialDir = archiveFile.parentFile ?: currentDir,
            onDismiss = { extractFolderPickerTarget = null },
            onFolderSelected = { targetDir ->
                extractFolderPickerTarget = null
                viewModel.extractArchiveToDirectory(archiveFile, targetDir) {
                    extractPasswordInput = ""
                    extractPasswordPrompt = Pair(archiveFile, targetDir)
                }
            }
        )
    }

    extractPasswordPrompt?.let { (archiveFile, targetDir) ->
        AlertDialog(
            onDismissRequest = { extractPasswordPrompt = null },
            title = { Text("Tệp nén có mật khẩu", color = TextPrimary) },
            text = {
                Column {
                    Text(
                        text = "Nhập mật khẩu để giải nén ${archiveFile.name}:",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = extractPasswordInput,
                        onValueChange = { extractPasswordInput = it },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        placeholder = { Text("Mật khẩu") },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ElectricBlue,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val pwd = extractPasswordInput
                        extractPasswordPrompt = null
                        viewModel.extractArchiveToDirectory(archiveFile, targetDir, password = pwd) {
                            extractPasswordPrompt = Pair(archiveFile, targetDir)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Giải nén")
                }
            },
            dismissButton = {
                TextButton(onClick = { extractPasswordPrompt = null }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 8. Info & Hash Dialog
    showInfoDialog?.let { item ->
        val file = File(item.path)
        AlertDialog(
            onDismissRequest = { showInfoDialog = null },
            title = { Text("Chi tiết tệp tin", color = TextPrimary) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Tên: ${item.name}", fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text("Đường dẫn: ${item.path}", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                    Text("Kích thước: ${FileItem.formatBytes(item.size)} (${item.size} bytes)", style = MaterialTheme.typography.bodySmall, color = TextPrimary)
                    Text("Ngày sửa đổi: ${FileItem.formatDate(item.lastModified)}", style = MaterialTheme.typography.bodySmall, color = TextMuted)
                    Text("Loại tệp: ${item.fileType.name} (${item.extension.ifEmpty { "không có" }})", style = MaterialTheme.typography.bodySmall, color = CyanAccent)

                    HorizontalDivider(color = DocumentsUIDivider, modifier = Modifier.padding(vertical = 4.dp))

                    if (infoHashText != null) {
                        Text(infoHashText!!, fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = TextPrimary)
                    } else if (isCalculatingInfoHash) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = ElectricBlue)
                    } else {
                        Button(
                            onClick = {
                                isCalculatingInfoHash = true
                                coroutineScope.launch {
                                    val hashes = HashUtils.calculateAllHashes(file).getOrDefault(emptyMap())
                                    val md5 = hashes["MD5"] ?: "Lỗi"
                                    val sha256 = hashes["SHA-256"] ?: "Lỗi"
                                    infoHashText = "MD5:\n$md5\n\nSHA-256:\n$sha256"
                                    isCalculatingInfoHash = false
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = CharcoalSurfaceHighlight)
                        ) {
                            Text("Tính mã băm MD5 / SHA-256")
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showInfoDialog = null }) {
                    Text("Đóng", color = ElectricBlue)
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }

    // 9. Cross-window Drag & Drop Confirmation Dialog (Copy / Cut / Cancel)
    pendingCrossWindowDrop?.let { (droppedFiles, targetDir) ->
        AlertDialog(
            onDismissRequest = { pendingCrossWindowDrop = null },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.MoveToInbox, contentDescription = null, tint = CyanAccent)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Thả ${droppedFiles.size} mục vào đây",
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Thư mục đích:",
                        color = TextMuted,
                        fontSize = 11.5.sp
                    )
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = CharcoalBackground,
                        border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = targetDir.absolutePath,
                            color = CyanAccent,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.5.sp,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                    val previewNames = droppedFiles.take(4).joinToString(", ") { it.name }
                    val extraCount = (droppedFiles.size - 4).coerceAtLeast(0)
                    Text(
                        text = if (extraCount > 0) "Mục đã kéo: $previewNames (+$extraCount mục khác)" else "Mục đã kéo: $previewNames",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "Chọn hành động Sao chép (Copy) hoặc Cắt (Di chuyển) xuống thư mục đích:",
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            },
            confirmButton = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { pendingCrossWindowDrop = null },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, CharcoalSurfaceHighlight),
                        modifier = Modifier.heightIn(min = 48.dp)
                    ) {
                        Text("Hủy", color = TextMuted, fontSize = 12.5.sp)
                    }
                    Button(
                        onClick = {
                            val paths = droppedFiles.map { it.absolutePath }
                            pendingCrossWindowDrop = null
                            viewModel.transferExternalPaths(
                                sourcePaths = paths,
                                targetDir = targetDir,
                                isMove = false,
                                targetWindowId = windowInstanceId
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .testTag("dnd_confirm_copy_button")
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Copy", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                    Button(
                        onClick = {
                            val paths = droppedFiles.map { it.absolutePath }
                            pendingCrossWindowDrop = null
                            viewModel.transferExternalPaths(
                                sourcePaths = paths,
                                targetDir = targetDir,
                                isMove = true,
                                targetWindowId = windowInstanceId
                            )
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = Color.Black),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .testTag("dnd_confirm_cut_button")
                    ) {
                        Icon(Icons.Default.ContentCut, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Cắt", fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    }
                }
            },
            containerColor = CharcoalSurfaceVariant
        )
    }
}

/**
 * 1. Horizontal Category Filter Chips Row matching Android DocumentsUI screenshot
 */
@Composable
private fun CategoryFilterRow(
    onSelectCategory: (FileType, String) -> Unit
) {
    val categories = remember {
        listOf(
            Triple(FileType.IMAGE, "Hình ảnh", Icons.Default.Image),
            Triple(FileType.AUDIO, "Âm thanh", Icons.Default.Headphones),
            Triple(FileType.VIDEO, "Video", Icons.Default.Movie),
            Triple(FileType.DOCUMENT, "Tài liệu", Icons.Default.Description),
            Triple(FileType.APK, "File APK", Icons.Default.Android),
            Triple(FileType.GAME_DATA, "Game Data", Icons.Default.SportsEsports),
            Triple(FileType.ARCHIVE, "File nén", Icons.Default.FolderZip),
            Triple(FileType.DATABASE, "Database", Icons.Default.Storage)
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 3.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        categories.forEach { (type, title, icon) ->
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = CharcoalSurface,
                border = androidx.compose.foundation.BorderStroke(1.dp, ChipBorderColor),
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .clickable { onSelectCategory(type, title) }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (type == FileType.ARCHIVE) {
                        ZipDocumentBadgeIcon(modifier = Modifier.size(width = 16.dp, height = 20.dp))
                    } else {
                        Icon(
                            imageVector = icon,
                            contentDescription = title,
                            tint = CoralChipTint,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = title,
                        color = TextPrimary,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

/**
 * 2. Subheader row: "Tệp trên [Folder Name]" + Grid/List Toggle & Sort
 */
@Composable
private fun SubheaderRow(
    folderName: String,
    itemCount: Int,
    isGridView: Boolean,
    onToggleView: () -> Unit,
    onOpenSort: () -> Unit,
    onOpenNewWindow: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Tệp trên $folderName",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF9AA0A6),
            fontSize = 13.sp
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = onOpenNewWindow,
                modifier = Modifier.size(30.dp)
            ) {
                Icon(
                    Icons.Default.Launch,
                    contentDescription = "Mở cửa sổ mới",
                    tint = CyanAccent,
                    modifier = Modifier.size(17.dp)
                )
            }

            IconButton(
                onClick = onOpenSort,
                modifier = Modifier.size(30.dp)
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.Sort,
                    contentDescription = "Sắp xếp",
                    tint = Color(0xFF9AA0A6),
                    modifier = Modifier.size(17.dp)
                )
            }

            IconButton(
                onClick = onToggleView,
                modifier = Modifier.size(30.dp)
            ) {
                Icon(
                    if (isGridView) Icons.Default.ViewList else Icons.Default.GridView,
                    contentDescription = if (isGridView) "Dạng danh sách" else "Dạng lưới",
                    tint = Color(0xFF9AA0A6),
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

/**
 * 3. Breadcrumb Path Bar for fast backward folder jumps
 */
@Composable
private fun PathBreadcrumbsBar(
    currentDir: File,
    onNavigateTo: (File) -> Unit
) {
    val rootPath = android.os.Environment.getExternalStorageDirectory().absolutePath
    val segments = remember(currentDir) {
        val list = mutableListOf<File>()
        var curr: File? = currentDir
        while (curr != null) {
            list.add(0, curr)
            if (curr.absolutePath == rootPath || curr.parentFile == null) break
            curr = curr.parentFile
        }
        list
    }

    if (segments.size > 1) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            segments.forEachIndexed { index, seg ->
                val name = if (index == 0) (android.os.Build.MODEL.ifEmpty { "Bộ nhớ trong" }) else seg.name
                val isLast = index == segments.size - 1
                Text(
                    text = name,
                    color = if (isLast) TextPrimary else ElectricBlue,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 12.sp,
                    fontWeight = if (isLast) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.clickable { onNavigateTo(seg) }
                )
                if (!isLast) {
                    Text(
                        text = "  /  ",
                        color = TextMuted,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

private fun File.canonicalPathOrAbs(): String =
    runCatching { canonicalPath }.getOrDefault(absolutePath)

@OptIn(ExperimentalFoundationApi::class)
private suspend fun androidx.compose.foundation.draganddrop.DragAndDropSourceScope.detectPickUpOrDragGesture(
    onBuildTransferData: () -> DragAndDropTransferData?
) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val touchSlop = viewConfiguration.touchSlop
        var started = false

        withTimeoutOrNull(220L) {
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (change.changedToUpIgnoreConsumed()) {
                    return@withTimeoutOrNull
                }
                val distance = (change.position - down.position).getDistance()
                if (distance > touchSlop) {
                    started = true
                    onBuildTransferData()?.let { startTransfer(it) }
                    return@withTimeoutOrNull
                }
            }
        }

        if (!started) {
            val currentEvent = currentEvent
            val stillDown = currentEvent.changes.any { it.id == down.id && it.pressed }
            if (stillDown) {
                onBuildTransferData()?.let { startTransfer(it) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MultiSelectDragPillBar(
    selectedItems: List<FileItem>,
    windowInstanceId: String
) {
    val textMeasurer = rememberTextMeasurer()
    val dragLabel = if (selectedItems.size > 1) "Kéo ${selectedItems.size} mục" else selectedItems.firstOrNull()?.name ?: "1 mục"
    val currentSelectedItems by rememberUpdatedState(selectedItems)
    val currentDragLabel by rememberUpdatedState(dragLabel)

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = CyanGlow.copy(alpha = 0.14f),
        border = BorderStroke(1.2.dp, CyanGlow.copy(alpha = 0.7f)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .testTag("multi_select_drag_pill")
            .dragAndDropSource(
                drawDragDecoration = {
                    val badgeW = size.width.coerceAtMost(640f)
                    val badgeH = size.height.coerceAtLeast(96f)
                    drawRoundRect(
                        color = Color(0xFF0A1224),
                        size = androidx.compose.ui.geometry.Size(badgeW, badgeH),
                        cornerRadius = CornerRadius(24f, 24f)
                    )
                    drawRoundRect(
                        color = CyanGlow,
                        size = androidx.compose.ui.geometry.Size(badgeW, badgeH),
                        cornerRadius = CornerRadius(24f, 24f),
                        style = Stroke(width = 4f)
                    )
                    val measured = textMeasurer.measure(
                        text = currentDragLabel,
                        style = TextStyle(color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold),
                        maxLines = 1
                    )
                    drawText(
                        textLayoutResult = measured,
                        topLeft = Offset(
                            x = ((badgeW - measured.size.width) / 2f).coerceAtLeast(12f),
                            y = ((badgeH - measured.size.height) / 2f).coerceAtLeast(8f)
                        )
                    )
                }
            ) {
                detectPickUpOrDragGesture {
                    val snapshot = currentSelectedItems
                    if (snapshot.isEmpty()) null
                    else DragAndDropTransferData(
                        clipData = CrossWindowTransferBus.buildClipData(windowInstanceId, snapshot),
                        flags = View.DRAG_FLAG_GLOBAL or View.DRAG_FLAG_GLOBAL_URI_READ
                    )
                }
            }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = GoldAccent.copy(alpha = 0.18f),
                border = BorderStroke(1.dp, GoldAccent.copy(alpha = 0.6f)),
                modifier = Modifier.size(32.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.OpenWith,
                        contentDescription = "Nhấc lên để kéo thả",
                        tint = GoldAccent,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Nhấc & kéo ${selectedItems.size} mục sang cửa sổ khác",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "Chạm giữ & kéo thanh này hoặc giữ vào mục đã chọn",
                    color = CyanAccent,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                imageVector = Icons.Default.DragIndicator,
                contentDescription = null,
                tint = CyanAccent,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/**
 * 4. Content pane (List / Grid) with DocumentsUI clean divider style + Cross-window Drop Zone
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PaneContent(
    paneIndex: Int,
    dir: File,
    items: List<FileItem>,
    isLoading: Boolean,
    isGridView: Boolean,
    selectedItems: Set<FileItem>,
    clipboard: ClipboardState?,
    onEnterDir: (File) -> Unit,
    onOpenFile: (FileItem) -> Unit,
    onToggleSelect: (FileItem) -> Unit,
    onLongClick: (FileItem) -> Unit,
    onFocus: () -> Unit,
    onTransferToOtherPane: (FileItem, Boolean) -> Unit,
    otherPaneDirName: String,
    onShowInfo: (FileItem) -> Unit,
    onRename: (FileItem) -> Unit,
    onDelete: (FileItem) -> Unit,
    onCompress: (FileItem) -> Unit,
    onExtractHere: (FileItem) -> Unit,
    onExtractToFolder: (FileItem) -> Unit,
    windowInstanceId: String,
    onCrossWindowDrop: (List<String>, File) -> Unit
) {
    val context = LocalContext.current
    var isPaneDragOver by remember { mutableStateOf(false) }
    var hoveredFolderPath by remember { mutableStateOf<String?>(null) }

    val currentDirState by rememberUpdatedState(dir)
    val hoveredFolderPathState by rememberUpdatedState(hoveredFolderPath)
    val currentOnCrossWindowDrop by rememberUpdatedState(onCrossWindowDrop)
    val selectedList = remember(selectedItems) { selectedItems.toList() }

    val paneDropCallback = remember(windowInstanceId, dir.absolutePath) {
        object : DragAndDropTarget {
            override fun onStarted(event: DragAndDropEvent) {
                isPaneDragOver = true
            }

            override fun onEntered(event: DragAndDropEvent) {
                isPaneDragOver = true
            }

            override fun onExited(event: DragAndDropEvent) {
                isPaneDragOver = false
                hoveredFolderPath = null
            }

            override fun onEnded(event: DragAndDropEvent) {
                isPaneDragOver = false
                hoveredFolderPath = null
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                isPaneDragOver = false
                val targetDir = hoveredFolderPathState?.let(::File) ?: currentDirState
                hoveredFolderPath = null
                val payload = CrossWindowTransferBus.parseClipData(event.toAndroidDragEvent().clipData)
                    ?: return false
                if (payload.sourceWindowId == windowInstanceId &&
                    targetDir.canonicalPathOrAbs() == currentDirState.canonicalPathOrAbs()
                ) {
                    return false
                }
                currentOnCrossWindowDrop(payload.paths, targetDir)
                return true
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .dragAndDropTarget(
                shouldStartDragAndDrop = { event ->
                    event.mimeTypes().contains(CrossWindowTransferBus.MIME_TYPE_FILEMANAGER_PATHS)
                },
                target = paneDropCallback
            )
            .then(
                if (isPaneDragOver) {
                    Modifier.border(2.5.dp, CyanGlow, RoundedCornerShape(14.dp))
                } else {
                    Modifier
                }
            )
    ) {
        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ElectricBlue)
            }
        } else if (items.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onFocus() },
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = if (isPaneDragOver) Icons.Default.MoveToInbox else Icons.Default.FolderOpen,
                        contentDescription = null,
                        tint = if (isPaneDragOver) CyanAccent else TextMuted,
                        modifier = Modifier.size(54.dp)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = if (isPaneDragOver) "Thả vào đây để Copy hoặc Cắt" else "Thư mục trống",
                        color = if (isPaneDragOver) CyanAccent else TextMuted,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (isPaneDragOver) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        } else if (isGridView) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 100.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onFocus() }
            ) {
                items(items, key = { "${paneIndex}_${it.path}" }) { item ->
                    val isSelected = selectedItems.contains(item)
                    val dragItems = if (isSelected && selectedList.isNotEmpty()) selectedList else listOf(item)
                    GridFileCard(
                        item = item,
                        isSelected = isSelected,
                        windowInstanceId = windowInstanceId,
                        dragItems = dragItems,
                        isFolderDropHovered = hoveredFolderPath == item.path,
                        onFolderHoverChanged = { hovered ->
                            hoveredFolderPath = if (hovered) item.path else if (hoveredFolderPath == item.path) null else hoveredFolderPath
                        },
                        onCrossWindowDropOnFolder = { paths, targetFolder ->
                            isPaneDragOver = false
                            hoveredFolderPath = null
                            onCrossWindowDrop(paths, targetFolder)
                        },
                        onClick = {
                            onFocus()
                            if (selectedItems.isNotEmpty()) onToggleSelect(item)
                            else if (item.isDirectory) onEnterDir(File(item.path))
                            else onOpenFile(item)
                        },
                        onLongClick = {
                            onFocus()
                            onLongClick(item)
                        }
                    )
                }
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .clickable { onFocus() }
            ) {
                items(items, key = { "${paneIndex}_${it.path}" }) { item ->
                    val isSelected = selectedItems.contains(item)
                    val dragItems = if (isSelected && selectedList.isNotEmpty()) selectedList else listOf(item)
                    DocumentsUIListItem(
                        item = item,
                        isSelected = isSelected,
                        windowInstanceId = windowInstanceId,
                        dragItems = dragItems,
                        isFolderDropHovered = hoveredFolderPath == item.path,
                        onFolderHoverChanged = { hovered ->
                            hoveredFolderPath = if (hovered) item.path else if (hoveredFolderPath == item.path) null else hoveredFolderPath
                        },
                        onCrossWindowDropOnFolder = { paths, targetFolder ->
                            isPaneDragOver = false
                            hoveredFolderPath = null
                            onCrossWindowDrop(paths, targetFolder)
                        },
                        onClick = {
                            onFocus()
                            if (selectedItems.isNotEmpty()) onToggleSelect(item)
                            else if (item.isDirectory) onEnterDir(File(item.path))
                            else onOpenFile(item)
                        },
                        onLongClick = {
                            onFocus()
                            onLongClick(item)
                        },
                        onTransferToOtherPane = if (otherPaneDirName.isNotEmpty()) {
                            { isMove -> onTransferToOtherPane(item, isMove) }
                        } else null,
                        otherPaneDirName = otherPaneDirName,
                        onOpenWith = { FileUtils.openWithExternalApp(context, File(item.path)) },
                        onShowInfo = { onShowInfo(item) },
                        onRename = { onRename(item) },
                        onDelete = { onDelete(item) },
                        onCompress = { onCompress(item) },
                        onExtractHere = { onExtractHere(item) },
                        onExtractToFolder = { onExtractToFolder(item) }
                    )
                }
            }
        }

        // Floating Drop Zone Overlay Banner when dragging files over this window
        if (isPaneDragOver) {
            val destName = hoveredFolderPath?.let { File(it).name } ?: dir.name.ifEmpty { "Bộ nhớ" }
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = ObsidianDeep.copy(alpha = 0.92f),
                border = BorderStroke(1.2.dp, CyanGlow),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.MoveToInbox,
                        contentDescription = null,
                        tint = CyanAccent,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "Thả vào \"$destName\" để chọn Copy hoặc Cắt",
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.5.sp
                    )
                }
            }
        }
    }
}

/**
 * DocumentsUI Item Row: Folder / File icon + clean title + Drag & Drop source/folder target
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DocumentsUIListItem(
    item: FileItem,
    isSelected: Boolean,
    windowInstanceId: String,
    dragItems: List<FileItem>,
    isFolderDropHovered: Boolean,
    onFolderHoverChanged: (Boolean) -> Unit,
    onCrossWindowDropOnFolder: (List<String>, File) -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onTransferToOtherPane: ((Boolean) -> Unit)?,
    otherPaneDirName: String,
    onOpenWith: () -> Unit,
    onShowInfo: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onCompress: () -> Unit,
    onExtractHere: () -> Unit,
    onExtractToFolder: () -> Unit
) {
    val context = LocalContext.current
    val textMeasurer = rememberTextMeasurer()
    var showItemMenu by remember { mutableStateOf(false) }

    val dragLabel = if (dragItems.size > 1) "Kéo ${dragItems.size} mục" else item.name
    val currentDragItems by rememberUpdatedState(dragItems)
    val currentDragLabel by rememberUpdatedState(dragLabel)
    val currentOnFolderHoverChanged by rememberUpdatedState(onFolderHoverChanged)
    val currentOnCrossWindowDropOnFolder by rememberUpdatedState(onCrossWindowDropOnFolder)

    val folderDropCallback = remember(item.path, windowInstanceId) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(true)
            }

            override fun onExited(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(false)
            }

            override fun onEnded(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(false)
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                currentOnFolderHoverChanged(false)
                if (!item.isDirectory) return false
                val payload = CrossWindowTransferBus.parseClipData(event.toAndroidDragEvent().clipData)
                    ?: return false
                val targetCanonical = File(item.path).canonicalPathOrAbs()
                if (payload.paths.any { File(it).canonicalPathOrAbs() == targetCanonical }) return false
                currentOnCrossWindowDropOnFolder(payload.paths, File(item.path))
                return true
            }
        }
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = when {
            isFolderDropHovered -> GoldAccent.copy(alpha = 0.2f)
            isSelected -> CyanGlow.copy(alpha = 0.14f)
            else -> CharcoalSurface
        },
        border = BorderStroke(
            width = if (isFolderDropHovered || isSelected) 1.5.dp else 1.dp,
            color = when {
                isFolderDropHovered -> GoldAccent
                isSelected -> CyanGlow.copy(alpha = 0.75f)
                item.isDirectory -> GoldAccent.copy(alpha = 0.30f)
                else -> CharcoalSurfaceHighlight
            }
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(
                if (item.isDirectory) {
                    Modifier.dragAndDropTarget(
                        shouldStartDragAndDrop = { event ->
                            event.mimeTypes().contains(CrossWindowTransferBus.MIME_TYPE_FILEMANAGER_PATHS)
                        },
                        target = folderDropCallback
                    )
                } else {
                    Modifier
                }
            )
            .then(
                if (isSelected) {
                    Modifier
                        .dragAndDropSource(
                            drawDragDecoration = {
                                drawRoundRect(
                                    color = Color(0xFF0A1224),
                                    cornerRadius = CornerRadius(24f, 24f)
                                )
                                drawRoundRect(
                                    color = CyanGlow,
                                    cornerRadius = CornerRadius(24f, 24f),
                                    style = Stroke(width = 4f)
                                )
                                val measured = textMeasurer.measure(
                                    text = currentDragLabel,
                                    style = TextStyle(color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold),
                                    maxLines = 1
                                )
                                drawText(
                                    textLayoutResult = measured,
                                    topLeft = Offset(
                                        x = ((size.width - measured.size.width) / 2f).coerceAtLeast(16f),
                                        y = ((size.height - measured.size.height) / 2f).coerceAtLeast(8f)
                                    )
                                )
                            }
                        ) {
                            detectDragGesturesAfterLongPress(
                                onDragStart = {
                                    val snapshot = currentDragItems
                                    if (snapshot.isNotEmpty()) {
                                        startTransfer(
                                            DragAndDropTransferData(
                                                clipData = CrossWindowTransferBus.buildClipData(windowInstanceId, snapshot),
                                                flags = View.DRAG_FLAG_GLOBAL or View.DRAG_FLAG_GLOBAL_URI_READ
                                            )
                                        )
                                    }
                                },
                                onDrag = { _, _ -> }
                            )
                        }
                        .clickable(onClick = onClick)
                } else {
                    Modifier.combinedClickable(
                        onClick = onClick,
                        onLongClick = onLongClick
                    )
                }
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 10.dp, end = 4.dp, top = 7.dp, bottom = 7.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left Icon (Dark Premium bordered badge for folders, or rich file thumbnail/badge)
            FileIcon(item = item, isSelected = isSelected, modifier = Modifier.size(38.dp))

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    color = TextPrimary,
                    style = MaterialTheme.typography.bodyLarge,
                    fontSize = 14.5.sp,
                    fontWeight = if (item.isDirectory) FontWeight.Medium else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (isFolderDropHovered) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "Thả vào thư mục này",
                        color = GoldAccent,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                } else if (!item.isDirectory) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "${item.formattedSize}  •  ${item.formattedDate}",
                        color = TextSecondary,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 11.5.sp
                    )
                }
            }

            if (isSelected) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = CyanGlow.copy(alpha = 0.16f),
                    border = BorderStroke(1.dp, CyanGlow.copy(alpha = 0.55f)),
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("drag_handle_item")
                        .dragAndDropSource(
                            drawDragDecoration = {
                                val snapshotSize = currentDragItems.size
                                drawCircle(color = Color(0xFF0A1224), radius = size.minDimension / 2f)
                                drawCircle(color = CyanGlow, radius = size.minDimension / 2f - 2f, style = Stroke(width = 4f))
                                val measured = textMeasurer.measure(
                                    text = "$snapshotSize",
                                    style = TextStyle(color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                                )
                                drawText(
                                    textLayoutResult = measured,
                                    topLeft = Offset(
                                        x = (size.width - measured.size.width) / 2f,
                                        y = (size.height - measured.size.height) / 2f
                                    )
                                )
                            }
                        ) {
                            detectPickUpOrDragGesture {
                                val snapshot = currentDragItems
                                if (snapshot.isEmpty()) null
                                else DragAndDropTransferData(
                                    clipData = CrossWindowTransferBus.buildClipData(windowInstanceId, snapshot),
                                    flags = View.DRAG_FLAG_GLOBAL or View.DRAG_FLAG_GLOBAL_URI_READ
                                )
                            }
                        }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.DragIndicator,
                            contentDescription = "Kéo mục đã chọn",
                            tint = CyanAccent,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // Quick overflow menu for actions (transfer, open with, info, rename, delete)
            Box {
                IconButton(
                    onClick = { showItemMenu = true },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        Icons.Default.MoreVert,
                        contentDescription = "Tùy chọn",
                        tint = TextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                }

                DropdownMenu(
                    expanded = showItemMenu,
                    onDismissRequest = { showItemMenu = false },
                    modifier = Modifier.background(CharcoalSurfaceVariant)
                ) {
                    if (onTransferToOtherPane != null) {
                        DropdownMenuItem(
                            text = { Text("Sao chép sang $otherPaneDirName", color = CyanAccent) },
                            leadingIcon = { Icon(Icons.Default.ContentCopy, null, tint = CyanAccent) },
                            onClick = {
                                showItemMenu = false
                                onTransferToOtherPane(false)
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Di chuyển sang $otherPaneDirName", color = ElectricBlue) },
                            leadingIcon = { Icon(Icons.Default.ArrowForward, null, tint = ElectricBlue) },
                            onClick = {
                                showItemMenu = false
                                onTransferToOtherPane(true)
                            }
                        )
                        HorizontalDivider(color = DocumentsUIDivider)
                    }

                    if (!item.isDirectory) {
                        if (item.extension.equals("apk", ignoreCase = true) || item.fileType == FileType.APK) {
                            DropdownMenuItem(
                                text = { Text("Cài đặt APK ngay", color = ColorSuccessGreen, fontWeight = FontWeight.Bold) },
                                leadingIcon = { Icon(Icons.Default.Download, null, tint = ColorSuccessGreen) },
                                onClick = {
                                    showItemMenu = false
                                    ApkInstaller.installApk(context, File(item.path))
                                }
                            )
                        }
                        if (item.fileType == FileType.ARCHIVE || item.extension.lowercase(java.util.Locale.ROOT) in setOf("zip", "7z", "tar", "gz", "bz2", "xz", "tgz", "tbz2", "txz", "lz4", "zst", "zstd", "tar.gz", "tar.bz2", "tar.xz", "tar.lz4", "tar.zstd", "xapk", "apks", "apkm", "jar", "obb")) {
                            DropdownMenuItem(
                                text = { Text("Giải nén tại đây", color = CyanAccent, fontWeight = FontWeight.Medium) },
                                leadingIcon = { Icon(Icons.Default.FolderOpen, null, tint = CyanAccent) },
                                onClick = {
                                    showItemMenu = false
                                    onExtractHere()
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Giải nén đến thư mục khác...", color = ElectricBlue, fontWeight = FontWeight.Medium) },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.DriveFileMove, null, tint = ElectricBlue) },
                                onClick = {
                                    showItemMenu = false
                                    onExtractToFolder()
                                }
                            )
                        }
                        DropdownMenuItem(
                            text = { Text("Mở bằng ứng dụng khác...", color = TextPrimary) },
                            leadingIcon = { Icon(Icons.Default.OpenInNew, null, tint = TextPrimary) },
                            onClick = {
                                showItemMenu = false
                                onOpenWith()
                            }
                        )
                    }

                    DropdownMenuItem(
                        text = { Text("Nén thành tệp lưu trữ...", color = ColorWarningAmber) },
                        leadingIcon = { Icon(Icons.Default.FolderZip, null, tint = ColorWarningAmber) },
                        onClick = {
                            showItemMenu = false
                            onCompress()
                        }
                    )

                    DropdownMenuItem(
                        text = { Text("Đổi tên", color = TextPrimary) },
                        leadingIcon = { Icon(Icons.Default.Edit, null, tint = TextPrimary) },
                        onClick = {
                            showItemMenu = false
                            onRename()
                        }
                    )

                    DropdownMenuItem(
                        text = { Text("Chi tiết & Mã băm", color = TextPrimary) },
                        leadingIcon = { Icon(Icons.Default.Info, null, tint = TextPrimary) },
                        onClick = {
                            showItemMenu = false
                            onShowInfo()
                        }
                    )

                    DropdownMenuItem(
                        text = { Text("Xóa", color = ColorErrorRed) },
                        leadingIcon = { Icon(Icons.Default.Delete, null, tint = ColorErrorRed) },
                        onClick = {
                            showItemMenu = false
                            onDelete()
                        }
                    )
                }
            }
        }
    }
}

/**
 * Grid Card View with Drag & Drop support
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GridFileCard(
    item: FileItem,
    isSelected: Boolean,
    windowInstanceId: String,
    dragItems: List<FileItem>,
    isFolderDropHovered: Boolean,
    onFolderHoverChanged: (Boolean) -> Unit,
    onCrossWindowDropOnFolder: (List<String>, File) -> Unit,
    onClick: () -> Unit,
    onLongClick: () -> Unit
) {
    val textMeasurer = rememberTextMeasurer()
    val dragLabel = if (dragItems.size > 1) "Kéo ${dragItems.size} mục" else item.name
    val currentDragItems by rememberUpdatedState(dragItems)
    val currentDragLabel by rememberUpdatedState(dragLabel)
    val currentOnFolderHoverChanged by rememberUpdatedState(onFolderHoverChanged)
    val currentOnCrossWindowDropOnFolder by rememberUpdatedState(onCrossWindowDropOnFolder)

    val folderDropCallback = remember(item.path, windowInstanceId) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(true)
            }

            override fun onExited(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(false)
            }

            override fun onEnded(event: DragAndDropEvent) {
                if (item.isDirectory) currentOnFolderHoverChanged(false)
            }

            override fun onDrop(event: DragAndDropEvent): Boolean {
                currentOnFolderHoverChanged(false)
                if (!item.isDirectory) return false
                val payload = CrossWindowTransferBus.parseClipData(event.toAndroidDragEvent().clipData)
                    ?: return false
                val targetCanonical = File(item.path).canonicalPathOrAbs()
                if (payload.paths.any { File(it).canonicalPathOrAbs() == targetCanonical }) return false
                currentOnCrossWindowDropOnFolder(payload.paths, File(item.path))
                return true
            }
        }
    }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = when {
            isFolderDropHovered -> GoldAccent.copy(alpha = 0.22f)
            isSelected -> CyanGlow.copy(alpha = 0.16f)
            else -> CharcoalSurface
        },
        border = BorderStroke(
            width = if (isFolderDropHovered || isSelected) 1.5.dp else 1.1.dp,
            color = when {
                isFolderDropHovered -> GoldAccent
                isSelected -> CyanGlow.copy(alpha = 0.8f)
                item.isDirectory -> GoldAccent.copy(alpha = 0.38f)
                else -> CharcoalSurfaceHighlight
            }
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .then(
                if (item.isDirectory) {
                    Modifier.dragAndDropTarget(
                        shouldStartDragAndDrop = { event ->
                            event.mimeTypes().contains(CrossWindowTransferBus.MIME_TYPE_FILEMANAGER_PATHS)
                        },
                        target = folderDropCallback
                    )
                } else {
                    Modifier
                }
            )
            .then(
                if (isSelected) {
                    Modifier
                        .dragAndDropSource(
                            drawDragDecoration = {
                                drawRoundRect(color = Color(0xFF0A1224), cornerRadius = CornerRadius(24f, 24f))
                                drawRoundRect(
                                    color = CyanGlow,
                                    cornerRadius = CornerRadius(24f, 24f),
                                    style = Stroke(width = 4f)
                                )
                                val measured = textMeasurer.measure(
                                    text = currentDragLabel,
                                    style = TextStyle(color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                                    maxLines = 1
                                )
                                drawText(
                                    textLayoutResult = measured,
                                    topLeft = Offset(
                                        x = ((size.width - measured.size.width) / 2f).coerceAtLeast(8f),
                                        y = ((size.height - measured.size.height) / 2f).coerceAtLeast(8f)
                                    )
                                )
                            }
                        ) {
                            detectDragGesturesAfterLongPress(
                                onDragStart = {
                                    val snapshot = currentDragItems
                                    if (snapshot.isNotEmpty()) {
                                        startTransfer(
                                            DragAndDropTransferData(
                                                clipData = CrossWindowTransferBus.buildClipData(windowInstanceId, snapshot),
                                                flags = View.DRAG_FLAG_GLOBAL or View.DRAG_FLAG_GLOBAL_URI_READ
                                            )
                                        )
                                    }
                                },
                                onDrag = { _, _ -> }
                            )
                        }
                        .clickable(onClick = onClick)
                } else {
                    Modifier.combinedClickable(
                        onClick = onClick,
                        onLongClick = onLongClick
                    )
                }
            )
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            FileIcon(item = item, isSelected = isSelected, modifier = Modifier.size(42.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = item.name,
                color = TextPrimary,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                fontSize = 12.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            if (!item.isDirectory) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = item.formattedSize,
                    color = TextMuted,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp
                )
            }
        }
    }
}

/**
 * Custom ZIP document badge icon: Document sheet outline (📄) with zipper teeth and bold "ZIP" text
 */
@Composable
fun ZipDocumentBadgeIcon(modifier: Modifier = Modifier, label: String = "ZIP") {
    Surface(
        shape = RoundedCornerShape(topStart = 3.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp),
        color = Color(0xFF1B2230),
        border = androidx.compose.foundation.BorderStroke(1.2.dp, Color(0xFF4D88FF)),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(horizontal = 1.dp, vertical = 1.dp)
            ) {
                // Mini decorative zipper teeth
                Row(
                    horizontalArrangement = Arrangement.spacedBy(1.dp),
                    modifier = Modifier.padding(bottom = 1.5.dp)
                ) {
                    Box(modifier = Modifier.size(width = 2.5.dp, height = 1.5.dp).background(Color(0xFFFFA000)))
                    Box(modifier = Modifier.size(width = 2.5.dp, height = 1.5.dp).background(Color(0xFF4D88FF)))
                    Box(modifier = Modifier.size(width = 2.5.dp, height = 1.5.dp).background(Color(0xFFFFA000)))
                }
                // Bold text badge inside the document sheet
                Surface(
                    shape = RoundedCornerShape(2.dp),
                    color = Color(0xFF4D88FF)
                ) {
                    Text(
                        text = label.take(4).uppercase(java.util.Locale.ROOT),
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = if (label.length > 3) 6.5.sp else 8.sp,
                        letterSpacing = 0.3.sp,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        }
    }
}

/**
 * Dedicated PDF document badge icon: Adobe Red document outline with "PDF" text badge
 */
@Composable
fun PdfDocumentBadgeIcon(modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(topStart = 3.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp),
        color = Color(0xFF261517),
        border = androidx.compose.foundation.BorderStroke(1.2.dp, Color(0xFFE53935)),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(horizontal = 1.dp, vertical = 1.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.PictureAsPdf,
                    contentDescription = "PDF",
                    tint = Color(0xFFE53935),
                    modifier = Modifier.size(13.dp)
                )
                Spacer(modifier = Modifier.height(1.dp))
                Surface(
                    shape = RoundedCornerShape(2.dp),
                    color = Color(0xFFE53935)
                ) {
                    Text(
                        text = "PDF",
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 7.5.sp,
                        letterSpacing = 0.2.sp,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        }
    }
}

/**
 * Dedicated APK document badge icon: Android package sheet with robot icon & bold "APK" text
 */
@Composable
fun ApkDocumentBadgeIcon(modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(topStart = 3.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp),
        color = Color(0xFF142418),
        border = androidx.compose.foundation.BorderStroke(1.2.dp, Color(0xFF4CAF50)),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(horizontal = 1.dp, vertical = 1.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Android,
                    contentDescription = "APK",
                    tint = Color(0xFF4CAF50),
                    modifier = Modifier.size(13.dp)
                )
                Spacer(modifier = Modifier.height(1.dp))
                Surface(
                    shape = RoundedCornerShape(2.dp),
                    color = Color(0xFF4CAF50)
                ) {
                    Text(
                        text = "APK",
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 7.5.sp,
                        letterSpacing = 0.2.sp,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        }
    }
}

/**
 * Generic document badge icon for structured office docs, databases, and game assets
 */
@Composable
fun DocumentBadgeIcon(
    label: String,
    borderColor: Color,
    badgeColor: Color,
    icon: ImageVector? = null,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(topStart = 3.dp, topEnd = 7.dp, bottomStart = 3.dp, bottomEnd = 3.dp),
        color = Color(0xFF161A23),
        border = androidx.compose.foundation.BorderStroke(1.2.dp, borderColor),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(horizontal = 1.dp, vertical = 1.dp)
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = label,
                        tint = borderColor,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.height(1.dp))
                }
                Surface(
                    shape = RoundedCornerShape(2.dp),
                    color = badgeColor
                ) {
                    Text(
                        text = label.take(4).uppercase(java.util.Locale.ROOT),
                        color = Color.White,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = if (label.length > 3) 6.5.sp else 7.5.sp,
                        letterSpacing = 0.2.sp,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        }
    }
}

/**
 * File icon mapper supporting folders and specific file type icons (PDF, ZIP, APK, Office, Code, etc.)
 */
@Composable
fun FileIcon(item: FileItem, isSelected: Boolean, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    if (isSelected) {
        Surface(
            shape = CircleShape,
            color = ElectricBlue,
            modifier = modifier
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }
        return
    }

    if (item.isDirectory) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = GoldAccent.copy(alpha = 0.14f),
            border = androidx.compose.foundation.BorderStroke(1.1.dp, GoldAccent.copy(alpha = 0.6f)),
            modifier = modifier
        ) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Folder,
                    contentDescription = "Thư mục",
                    tint = GoldAccent,
                    modifier = Modifier.fillMaxSize(0.62f)
                )
            }
        }
        return
    }

    val ext = item.extension.lowercase(java.util.Locale.ROOT)

    // 1. Dedicated ZIP & Archive files (with extracted APK app icon thumbnail if archive contains an APK!)
    if (item.fileType == FileType.ARCHIVE || ext in setOf("zip", "rar", "7z", "tar", "gz", "xz", "bz2", "tgz", "tbz2", "txz", "lz4", "zst", "zstd", "tar.gz", "tar.bz2", "tar.xz", "tar.lz4", "tar.zstd")) {
        val archiveApkBmp by produceState<Bitmap?>(initialValue = null, item.path, item.lastModified) {
            value = FileThumbnailLoader.loadArchiveApkThumbnail(context, File(item.path))
        }
        val bmp = archiveApkBmp
        if (bmp != null) {
            Box(modifier = modifier, contentAlignment = Alignment.Center) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "APK trong tệp nén ${item.name}",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(6.dp))
                        .border(1.dp, Color(0xFF4D88FF), RoundedCornerShape(6.dp))
                )
                Surface(
                    color = Color(0xFF4D88FF),
                    shape = RoundedCornerShape(3.dp),
                    modifier = Modifier.align(Alignment.BottomEnd)
                ) {
                    Text(
                        text = if (ext.isNotEmpty()) ext.take(4).uppercase(java.util.Locale.ROOT) else "ZIP",
                        color = Color.White,
                        fontSize = 6.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        } else {
            ZipDocumentBadgeIcon(modifier = modifier, label = if (ext.isNotEmpty()) ext.uppercase(java.util.Locale.ROOT) else "ZIP")
        }
        return
    }

    // 2. Dedicated PDF files
    if (ext == "pdf") {
        PdfDocumentBadgeIcon(modifier = modifier)
        return
    }

    // 3. Dedicated APK / XAPK / APKS / APKM files with real extracted app icon thumbnail
    if (item.fileType == FileType.APK || ext in setOf("apk", "xapk", "apks", "apkm")) {
        val apkBmp by produceState<Bitmap?>(initialValue = null, item.path, item.lastModified) {
            value = if (ext == "apk") {
                FileThumbnailLoader.loadApkIconBitmap(context, File(item.path))
            } else {
                FileThumbnailLoader.loadArchiveApkThumbnail(context, File(item.path))
            }
        }
        val bmp = apkBmp
        if (bmp != null) {
            Box(modifier = modifier, contentAlignment = Alignment.Center) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "Biểu tượng APK ${item.name}",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(6.dp))
                )
                Surface(
                    color = Color(0xFF4CAF50),
                    shape = RoundedCornerShape(3.dp),
                    modifier = Modifier.align(Alignment.BottomEnd)
                ) {
                    Text(
                        text = ext.take(4).uppercase(java.util.Locale.ROOT),
                        color = Color.White,
                        fontSize = 6.5.sp,
                        fontWeight = FontWeight.ExtraBold,
                        modifier = Modifier.padding(horizontal = 2.dp, vertical = 0.5.dp)
                    )
                }
            }
        } else {
            ApkDocumentBadgeIcon(modifier = modifier)
        }
        return
    }

    // 4. Image Thumbnails via Coil
    if ((item.fileType == FileType.IMAGE || ext in setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic")) && ext != "svg") {
        Box(
            modifier = modifier
                .clip(RoundedCornerShape(6.dp))
                .background(CharcoalCard),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(File(item.path))
                    .size(128)
                    .crossfade(true)
                    .build(),
                contentDescription = item.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }
        return
    }

    // 5. Video Thumbnails via MediaMetadataRetriever
    if (item.fileType == FileType.VIDEO || ext in setOf("mp4", "mkv", "avi", "mov", "webm", "3gp", "flv", "wmv", "m4v")) {
        val videoBmp by produceState<Bitmap?>(initialValue = null, item.path, item.lastModified) {
            value = FileThumbnailLoader.loadVideoThumbnail(File(item.path))
        }
        val bmp = videoBmp
        if (bmp != null) {
            Box(
                modifier = modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = item.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
                Surface(
                    shape = CircleShape,
                    color = Color.Black.copy(alpha = 0.55f),
                    modifier = Modifier.size(16.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(11.dp)
                        )
                    }
                }
            }
        } else {
            Icon(
                imageVector = Icons.Default.Movie,
                contentDescription = item.extension,
                tint = Color(0xFFEF5350),
                modifier = modifier
            )
        }
        return
    }

    // 6. Office & Text documents
    when (ext) {
        "doc", "docx", "rtf", "odt" -> {
            DocumentBadgeIcon("DOC", Color(0xFF2B579A), Color(0xFF2B579A), Icons.Default.Description, modifier)
            return
        }
        "xls", "xlsx", "csv", "tsv", "ods" -> {
            DocumentBadgeIcon(if (ext == "csv") "CSV" else "XLS", Color(0xFF217346), Color(0xFF217346), Icons.Default.TableChart, modifier)
            return
        }
        "ppt", "pptx", "odp" -> {
            DocumentBadgeIcon("PPT", Color(0xFFD24726), Color(0xFFD24726), Icons.Default.Slideshow, modifier)
            return
        }
        "txt", "log", "ini", "cfg", "conf", "env", "properties" -> {
            DocumentBadgeIcon("TXT", Color(0xFF5C6BC0), Color(0xFF5C6BC0), Icons.Default.Article, modifier)
            return
        }
        "md", "markdown" -> {
            DocumentBadgeIcon("MD", Color(0xFF00ACC1), Color(0xFF00ACC1), Icons.Default.Article, modifier)
            return
        }
    }

    // 7. Code & Scripts
    when (ext) {
        "ts", "tsx", "txs" -> {
            DocumentBadgeIcon("TS", Color(0xFF3178C6), Color(0xFF3178C6), Icons.Default.Code, modifier)
            return
        }
        "js", "jsx" -> {
            DocumentBadgeIcon("JS", Color(0xFFF7DF1E), Color(0xFFC6AC00), Icons.Default.Code, modifier)
            return
        }
        "css", "scss", "sass", "less" -> {
            DocumentBadgeIcon("CSS", Color(0xFF264DE4), Color(0xFF264DE4), Icons.Default.Code, modifier)
            return
        }
        "html", "htm" -> {
            DocumentBadgeIcon("HTML", Color(0xFFE44D26), Color(0xFFE44D26), Icons.Default.Code, modifier)
            return
        }
        "bat", "cmd", "sh", "bash", "zsh", "ps1", "vbs" -> {
            DocumentBadgeIcon(if (ext in setOf("sh", "bash", "zsh")) "SH" else "BAT", Color(0xFF00E676), Color(0xFF00A854), Icons.Default.Terminal, modifier)
            return
        }
        "dat", "bin", "pak", "obb", "sav", "save", "unity3d", "asset", "bundle", "res", "raw" -> {
            DocumentBadgeIcon(ext.take(3).uppercase(java.util.Locale.ROOT), Color(0xFFAB47BC), Color(0xFF8E24AA), Icons.Default.SportsEsports, modifier)
            return
        }
        "db", "sqlite", "sqlite3", "sqlitedb" -> {
            DocumentBadgeIcon("DB", Color(0xFF00BFA5), Color(0xFF00897B), Icons.Default.Storage, modifier)
            return
        }
    }

    // 8. Fallback Media & Icons
    val (icon, color) = when {
        ext in setOf("kt", "kts", "java", "py", "c", "cpp", "h", "hpp", "cs", "php", "sql", "go", "rs", "lua", "json", "xml", "yaml", "yml", "toml") -> {
            Icons.Default.Code to CyanAccent
        }
        item.fileType == FileType.DATABASE -> {
            Icons.Default.Storage to ColorSuccessGreen
        }
        ext == "svg" || item.fileType == FileType.IMAGE -> {
            Icons.Default.Image to Color(0xFFF48FB1)
        }
        item.fileType == FileType.AUDIO || ext in setOf("mp3", "wav", "flac", "aac", "ogg", "m4a", "opus", "wma") -> {
            Icons.Default.Headphones to CyanAccent
        }
        item.fileType == FileType.DOCUMENT -> {
            Icons.Default.Article to ElectricBlue
        }
        else -> Icons.Default.InsertDriveFile to Color(0xFF9AA0A6)
    }

    Icon(
        imageVector = icon,
        contentDescription = item.extension,
        tint = color,
        modifier = modifier
    )
}

private tailrec fun Context.findActivityOrNull(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivityOrNull()
    else -> null
}

/**
 * Launches a genuinely separate, independent File Manager Pro window task.
 */
fun openNewAppWindow(context: Context, initialDirPath: String? = null) {
    val currentActivity = context.findActivityOrNull()
    val targetClass = if (currentActivity is SecondaryWindowActivity) {
        MainActivity::class.java
    } else {
        SecondaryWindowActivity::class.java
    }
    val baseFlags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
        Intent.FLAG_ACTIVITY_NEW_DOCUMENT
    val isAlreadyMultiWindow = currentActivity?.isInMultiWindowMode == true

    val intent = Intent(context, targetClass).apply {
        data = Uri.parse("filemanagerpro://window/${System.currentTimeMillis()}")
        putExtra(SecondaryWindowActivity.EXTRA_START_IN_FILES, true)
        if (!initialDirPath.isNullOrBlank()) {
            putExtra(SecondaryWindowActivity.EXTRA_INITIAL_PATH, initialDirPath)
        }
        addFlags(if (isAlreadyMultiWindow) baseFlags or Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT else baseFlags)
    }

    try {
        context.startActivity(intent)
        Toast.makeText(
            context,
            "Đã mở cửa sổ File Manager Pro độc lập mới (xem trong Đa nhiệm)",
            Toast.LENGTH_SHORT
        ).show()
    } catch (_: Exception) {
        val fallbackIntent = Intent(context, targetClass).apply {
            data = Uri.parse("filemanagerpro://window/${System.nanoTime()}")
            putExtra(SecondaryWindowActivity.EXTRA_START_IN_FILES, true)
            if (!initialDirPath.isNullOrBlank()) {
                putExtra(SecondaryWindowActivity.EXTRA_INITIAL_PATH, initialDirPath)
            }
            addFlags(baseFlags)
        }
        context.startActivity(fallbackIntent)
    }
}
