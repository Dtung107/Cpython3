package com.example.filemanager.ui.archive

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DriveFileMove
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.example.filemanager.archive.*
import com.example.filemanager.model.FileItem
import com.example.filemanager.utils.FileOperations
import com.example.ui.theme.*
import java.io.File
import java.io.FileOutputStream
import java.security.SecureRandom

/**
 * Full-featured ZArchiver-style "Tạo tệp lưu trữ" dialog with:
 * - Archive name & "..." destination folder picker button
 * - Archive format (7z, zip, tar, tar.bz2, tar.gz, tar.xz, tar.lz4, tar.zstd)
 * - Compression level (Không nén, Nhanh nhất, Nhanh, Bình thường, Tối đa, Siêu nén)
 * - Encryption (Không mã hóa, Dữ liệu ZipCrypto, AES-256)
 * - Password with visibility toggle & "..." generator
 * - Split archive volumes (Không, 10MB..4GB)
 * - Delete sources after compression & Create separate archives checkboxes
 */
@Composable
fun CreateArchiveDialog(
    initialArchiveName: String,
    initialDestinationDir: File,
    selectedItemCount: Int,
    onDismiss: () -> Unit,
    onConfirmCompress: (ArchiveCompressionConfig) -> Unit,
    onSwitchToExtractOtherFolder: (() -> Unit)? = null
) {
    var selectedFormat by remember { mutableStateOf(ArchiveFormat.ZIP) }
    var archiveName by remember {
        val base = initialArchiveName.ifBlank { "archive" }
        mutableStateOf(ArchiveFormat.replaceExtension(base, ArchiveFormat.ZIP))
    }
    var destinationDir by remember { mutableStateOf(initialDestinationDir) }
    var compressionLevel by remember { mutableStateOf(ArchiveCompressionLevel.FAST) }
    var encryptionMethod by remember { mutableStateOf(ArchiveEncryptionMethod.ZIP_CRYPTO) }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var splitOption by remember { mutableStateOf(ArchiveSplitOption.NONE) }
    var deleteSource by remember { mutableStateOf(false) }
    var createSeparate by remember { mutableStateOf(false) }

    // Dropdown visibility states
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showFormatMenu by remember { mutableStateOf(false) }
    var showLevelMenu by remember { mutableStateOf(false) }
    var showEncryptionMenu by remember { mutableStateOf(false) }
    var showSplitMenu by remember { mutableStateOf(false) }
    var showPasswordMenu by remember { mutableStateOf(false) }
    var showFolderPicker by remember { mutableStateOf(false) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            shape = RoundedCornerShape(10.dp),
            color = Color(0xFF1F2227),
            tonalElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .widthIn(max = 480.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 10.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // Header row with title and 3-dot overflow menu
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Tạo tệp lưu trữ",
                        color = TextPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )

                    Box {
                        IconButton(
                            onClick = { showOverflowMenu = true },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Tùy chọn", tint = TextPrimary)
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false },
                            modifier = Modifier.background(CharcoalSurfaceVariant)
                        ) {
                            DropdownMenuItem(
                                text = { Text("Chọn thư mục đích khác...", color = CyanAccent) },
                                leadingIcon = { Icon(Icons.Default.FolderOpen, null, tint = CyanAccent) },
                                onClick = {
                                    showOverflowMenu = false
                                    showFolderPicker = true
                                }
                            )
                            if (onSwitchToExtractOtherFolder != null) {
                                DropdownMenuItem(
                                    text = { Text("Đến thư mục khác để giải nén...", color = ColorWarningAmber) },
                                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.DriveFileMove, null, tint = ColorWarningAmber) },
                                    onClick = {
                                        showOverflowMenu = false
                                        onDismiss()
                                        onSwitchToExtractOtherFolder()
                                    }
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("Khôi phục cài đặt mặc định", color = TextPrimary) },
                                leadingIcon = { Icon(Icons.Default.Refresh, null, tint = TextSecondary) },
                                onClick = {
                                    showOverflowMenu = false
                                    selectedFormat = ArchiveFormat.ZIP
                                    archiveName = ArchiveFormat.replaceExtension(initialArchiveName.ifBlank { "archive" }, ArchiveFormat.ZIP)
                                    destinationDir = initialDestinationDir
                                    compressionLevel = ArchiveCompressionLevel.FAST
                                    encryptionMethod = ArchiveEncryptionMethod.ZIP_CRYPTO
                                    password = ""
                                    splitOption = ArchiveSplitOption.NONE
                                    deleteSource = false
                                    createSeparate = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Archive Name + "..." Destination Folder Picker Button
                Text(
                    text = "Tệp lưu trữ:",
                    color = TextMuted,
                    fontSize = 12.sp
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = archiveName,
                        onValueChange = { archiveName = it },
                        singleLine = true,
                        enabled = !createSeparate,
                        placeholder = { Text("archive.zip", color = TextMuted) },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            disabledContainerColor = Color.Transparent,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            disabledTextColor = TextMuted,
                            focusedIndicatorColor = ElectricBlue,
                            unfocusedIndicatorColor = TextMuted
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = Color(0xFF545861),
                        modifier = Modifier
                            .size(width = 46.dp, height = 34.dp)
                            .clickable { showFolderPicker = true }
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("...", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }
                    }
                }

                // Destination directory pill (clickable to pick another folder)
                Spacer(modifier = Modifier.height(6.dp))
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = CharcoalSurface,
                    border = androidx.compose.foundation.BorderStroke(0.8.dp, CharcoalSurfaceHighlight),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showFolderPicker = true }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Folder,
                            contentDescription = null,
                            tint = Color(0xFFFFA000),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Lưu tại: ${destinationDir.absolutePath}",
                            color = CyanAccent,
                            fontSize = 11.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            Icons.Default.Edit,
                            contentDescription = "Đổi thư mục",
                            tint = TextMuted,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Row: Định dạng lưu trữ & Mức độ nén
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Format selector
                    Box(modifier = Modifier.weight(1f)) {
                        Column {
                            Text("Định dạng lưu trữ:", color = TextMuted, fontSize = 12.sp)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { showFormatMenu = true }
                                    .padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = selectedFormat.displayName,
                                    color = TextPrimary,
                                    fontSize = 15.sp
                                )
                                Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = TextSecondary)
                            }
                        }
                        DropdownMenu(
                            expanded = showFormatMenu,
                            onDismissRequest = { showFormatMenu = false },
                            modifier = Modifier.background(Color(0xFF1A1D22))
                        ) {
                            ArchiveFormat.entries.forEach { fmt ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = fmt.displayName,
                                            color = if (fmt == selectedFormat) CyanAccent else TextPrimary,
                                            fontWeight = if (fmt == selectedFormat) FontWeight.Bold else FontWeight.Normal,
                                            fontSize = 15.sp
                                        )
                                    },
                                    onClick = {
                                        selectedFormat = fmt
                                        archiveName = ArchiveFormat.replaceExtension(archiveName, fmt)
                                        if (!fmt.supportsEncryption) {
                                            encryptionMethod = ArchiveEncryptionMethod.NONE
                                        } else if (encryptionMethod == ArchiveEncryptionMethod.NONE) {
                                            encryptionMethod = ArchiveEncryptionMethod.ZIP_CRYPTO
                                        }
                                        showFormatMenu = false
                                    }
                                )
                            }
                        }
                    }

                    // Compression level selector
                    Box(modifier = Modifier.weight(1f)) {
                        Column {
                            Text("Mức độ nén:", color = TextMuted, fontSize = 12.sp)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { showLevelMenu = true }
                                    .padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = compressionLevel.displayName,
                                    color = TextPrimary,
                                    fontSize = 15.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = TextSecondary)
                            }
                        }
                        DropdownMenu(
                            expanded = showLevelMenu,
                            onDismissRequest = { showLevelMenu = false },
                            modifier = Modifier.background(Color(0xFF1A1D22))
                        ) {
                            ArchiveCompressionLevel.entries.forEach { lvl ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = lvl.displayName,
                                            color = if (lvl == compressionLevel) CyanAccent else TextPrimary,
                                            fontWeight = if (lvl == compressionLevel) FontWeight.Bold else FontWeight.Normal,
                                            fontSize = 15.sp
                                        )
                                    },
                                    onClick = {
                                        compressionLevel = lvl
                                        showLevelMenu = false
                                    }
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Encryption Selector
                Box(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text(
                            text = if (selectedFormat.supportsEncryption) "Mã hóa:" else "Mã hóa (chỉ áp dụng cho ZIP):",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = selectedFormat.supportsEncryption) { showEncryptionMenu = true }
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (selectedFormat.supportsEncryption) encryptionMethod.displayName else "Không hỗ trợ cho ${selectedFormat.displayName}",
                                color = if (selectedFormat.supportsEncryption) TextPrimary else TextMuted,
                                fontSize = 15.sp
                            )
                            Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = TextSecondary)
                        }
                    }
                    DropdownMenu(
                        expanded = showEncryptionMenu,
                        onDismissRequest = { showEncryptionMenu = false },
                        modifier = Modifier.background(Color(0xFF1A1D22))
                    ) {
                        ArchiveEncryptionMethod.entries.forEach { enc ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = enc.displayName,
                                        color = if (enc == encryptionMethod) CyanAccent else TextPrimary,
                                        fontWeight = if (enc == encryptionMethod) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                onClick = {
                                    encryptionMethod = enc
                                    showEncryptionMenu = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Password field + Eye toggle + "..." options
                Text("Mật khẩu:", color = TextMuted, fontSize = 12.sp)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextField(
                        value = password,
                        onValueChange = { password = it },
                        singleLine = true,
                        enabled = selectedFormat.supportsEncryption && encryptionMethod != ArchiveEncryptionMethod.NONE,
                        placeholder = { Text("Nhập mật khẩu", color = TextMuted) },
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = "Hiện/Ẩn mật khẩu",
                                    tint = CyanAccent
                                )
                            }
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            disabledContainerColor = Color.Transparent,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            disabledTextColor = TextMuted,
                            focusedIndicatorColor = ElectricBlue,
                            unfocusedIndicatorColor = TextMuted
                        ),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Box {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = Color(0xFF545861),
                            modifier = Modifier
                                .size(width = 46.dp, height = 34.dp)
                                .clickable { showPasswordMenu = true }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("...", color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            }
                        }
                        DropdownMenu(
                            expanded = showPasswordMenu,
                            onDismissRequest = { showPasswordMenu = false },
                            modifier = Modifier.background(CharcoalSurfaceVariant)
                        ) {
                            DropdownMenuItem(
                                text = { Text("Tạo mật khẩu ngẫu nhiên", color = CyanAccent) },
                                leadingIcon = { Icon(Icons.Default.Key, null, tint = CyanAccent) },
                                onClick = {
                                    password = generateRandomPassword(12)
                                    passwordVisible = true
                                    if (selectedFormat.supportsEncryption && encryptionMethod == ArchiveEncryptionMethod.NONE) {
                                        encryptionMethod = ArchiveEncryptionMethod.AES_256
                                    }
                                    showPasswordMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Xóa mật khẩu", color = TextPrimary) },
                                leadingIcon = { Icon(Icons.Default.Clear, null, tint = ColorErrorRed) },
                                onClick = {
                                    password = ""
                                    showPasswordMenu = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Split into volumes dropdown
                Box(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        Text("Chia thành các tệp:", color = TextMuted, fontSize = 12.sp)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showSplitMenu = true }
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = splitOption.displayName,
                                color = TextPrimary,
                                fontSize = 15.sp
                            )
                            Icon(Icons.Default.ArrowDropDown, contentDescription = null, tint = TextSecondary)
                        }
                    }
                    DropdownMenu(
                        expanded = showSplitMenu,
                        onDismissRequest = { showSplitMenu = false },
                        modifier = Modifier.background(Color(0xFF1A1D22))
                    ) {
                        ArchiveSplitOption.entries.forEach { sp ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = sp.displayName,
                                        color = if (sp == splitOption) CyanAccent else TextPrimary,
                                        fontWeight = if (sp == splitOption) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                onClick = {
                                    splitOption = sp
                                    showSplitMenu = false
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Checkbox: Xóa các tệp tin nguồn sau khi nén
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { deleteSource = !deleteSource }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = deleteSource,
                        onCheckedChange = { deleteSource = it },
                        colors = CheckboxDefaults.colors(
                            checkedColor = ElectricBlue,
                            uncheckedColor = TextSecondary
                        )
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Xóa các tệp tin nguồn sau khi nén", color = TextPrimary, fontSize = 14.sp)
                }

                // Checkbox: Tạo kho lưu trữ riêng biệt
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { createSeparate = !createSeparate }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = createSeparate,
                        onCheckedChange = { createSeparate = it },
                        colors = CheckboxDefaults.colors(
                            checkedColor = ElectricBlue,
                            uncheckedColor = TextSecondary
                        )
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (selectedItemCount > 1) "Tạo kho lưu trữ riêng biệt ($selectedItemCount tệp)" else "Tạo kho lưu trữ riêng biệt",
                        color = TextPrimary,
                        fontSize = 14.sp
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Footer buttons: HUỶ | OK
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("HUỶ", color = CyanAccent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(
                        onClick = {
                            onConfirmCompress(
                                ArchiveCompressionConfig(
                                    archiveFileName = archiveName.trim().ifEmpty { "archive.${selectedFormat.extension}" },
                                    destinationDir = destinationDir,
                                    format = selectedFormat,
                                    compressionLevel = compressionLevel,
                                    encryptionMethod = encryptionMethod,
                                    password = password,
                                    splitOption = splitOption,
                                    deleteSourceAfterCompression = deleteSource,
                                    createSeparateArchives = createSeparate
                                )
                            )
                        }
                    ) {
                        Text("OK", color = CyanAccent, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }
            }
        }
    }

    if (showFolderPicker) {
        FolderPickerDialog(
            title = "Chọn thư mục lưu tệp nén",
            initialDir = destinationDir,
            onDismiss = { showFolderPicker = false },
            onFolderSelected = { chosen ->
                destinationDir = chosen
                showFolderPicker = false
            }
        )
    }
}

/**
 * Interactive Directory Browser Dialog for picking any destination folder for Compression or Extraction
 */
@Composable
fun FolderPickerDialog(
    title: String,
    initialDir: File,
    showZipFiles: Boolean = false,
    onDismiss: () -> Unit,
    onFolderSelected: (File) -> Unit
) {
    val context = LocalContext.current
    val initialDirectory = remember(initialDir) {
        when {
            initialDir.exists() && initialDir.isDirectory -> initialDir
            initialDir.exists() && initialDir.isFile && initialDir.parentFile?.isDirectory == true -> initialDir.parentFile!!
            else -> Environment.getExternalStorageDirectory()
        }
    }
    var currentDir by remember { mutableStateOf(initialDirectory) }
    var refreshTrigger by remember { mutableIntStateOf(0) }
    var showNewFolderInput by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }

    fun hasStoragePerm(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    var hasStoragePermission by remember { mutableStateOf(hasStoragePerm()) }

    val manageStorageLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        hasStoragePermission = hasStoragePerm()
        refreshTrigger++
    }

    val legacyPermLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        hasStoragePermission = hasStoragePerm()
        refreshTrigger++
    }

    val systemZipLauncher = rememberLauncherForActivityResult(
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
                    onFolderSelected(destFile)
                }
            } catch (_: Exception) {
            }
        }
    }

    val volumes = remember(context, refreshTrigger) { FileOperations.getStorageVolumes(context) }

    val subFolders = remember(currentDir, refreshTrigger) {
        try {
            currentDir.listFiles()
                ?.filter { it.isDirectory && it.canRead() }
                ?.sortedBy { it.name.lowercase() }
                ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    val zipFiles = remember(currentDir, refreshTrigger, showZipFiles) {
        if (!showZipFiles) emptyList()
        else try {
            currentDir.listFiles()
                ?.filter { it.isFile && it.canRead() && it.extension.equals("zip", ignoreCase = true) }
                ?.sortedBy { it.name.lowercase() }
                ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = CharcoalSurface,
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(0.78f)
                .widthIn(max = 520.dp)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(CharcoalSurfaceVariant)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(title, color = TextPrimary, fontSize = 15.5.sp, fontWeight = FontWeight.Bold)
                        Text(
                            text = currentDir.absolutePath,
                            color = CyanAccent,
                            fontSize = 11.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    IconButton(onClick = { showNewFolderInput = !showNewFolderInput }) {
                        Icon(Icons.Default.CreateNewFolder, contentDescription = "Tạo thư mục mới", tint = Color(0xFFFFA000))
                    }
                }

                // Storage permission prompt when not granted yet
                if (!hasStoragePermission) {
                    Surface(
                        color = ColorWarningAmber.copy(alpha = 0.14f),
                        border = BorderStroke(1.dp, ColorWarningAmber.copy(alpha = 0.45f)),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = ColorWarningAmber, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Chưa có quyền đọc tất cả tệp .zip / thư mục.",
                                color = TextPrimary,
                                fontSize = 11.5.sp,
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
                                        legacyPermLauncher.launch(
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

                // Storage Volume Quick Switcher
                if (volumes.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        volumes.forEach { vol ->
                            FilterChip(
                                selected = currentDir.absolutePath == vol.path,
                                onClick = { currentDir = File(vol.path) },
                                label = { Text(vol.name, fontSize = 12.sp) },
                                leadingIcon = {
                                    Icon(
                                        if (vol.isRemovable) Icons.Default.SdCard else Icons.Default.PhoneAndroid,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            )
                        }
                    }
                }

                if (showNewFolderInput) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CharcoalSurfaceVariant)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = newFolderName,
                            onValueChange = { newFolderName = it },
                            placeholder = { Text("Tên thư mục mới...", fontSize = 13.sp) },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val trimmed = newFolderName.trim()
                                if (trimmed.isNotEmpty()) {
                                    val target = File(currentDir, trimmed)
                                    if (target.mkdirs() || target.exists()) {
                                        currentDir = target
                                        newFolderName = ""
                                        showNewFolderInput = false
                                        refreshTrigger++
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                        ) {
                            Text("Tạo")
                        }
                    }
                }

                HorizontalDivider(color = DocumentsUIDivider)

                // Folder & ZIP List
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                ) {
                    val parent = currentDir.parentFile
                    if (parent != null && parent.canRead()) {
                        item(key = "..") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { currentDir = parent }
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.DriveFolderUpload, null, tint = Color(0xFFFFA000), modifier = Modifier.size(28.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Text("..", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("(Thư mục cha)", color = TextMuted, fontSize = 12.sp)
                            }
                            HorizontalDivider(color = DocumentsUIDivider, thickness = 0.5.dp)
                        }
                    }

                    if (subFolders.isEmpty() && zipFiles.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (showZipFiles) "Không có thư mục con hoặc tệp .zip" else "Không có thư mục con",
                                    color = TextMuted,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    } else {
                        items(subFolders, key = { it.absolutePath }) { folder ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { currentDir = folder }
                                    .padding(horizontal = 16.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Folder, null, tint = Color(0xFFFFA000), modifier = Modifier.size(28.dp))
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = folder.name,
                                        color = TextPrimary,
                                        fontSize = 14.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Icon(Icons.Default.ChevronRight, null, tint = TextMuted, modifier = Modifier.size(18.dp))
                            }
                            HorizontalDivider(color = DocumentsUIDivider, thickness = 0.5.dp, modifier = Modifier.padding(start = 56.dp))
                        }

                        items(zipFiles, key = { it.absolutePath }) { zipFile ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onFolderSelected(zipFile) }
                                    .padding(horizontal = 16.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = ElectricBlue.copy(alpha = 0.2f),
                                    border = BorderStroke(1.dp, CyanAccent.copy(alpha = 0.55f)),
                                    modifier = Modifier.size(30.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Text(
                                            text = "ZIP",
                                            color = CyanAccent,
                                            fontSize = 9.5.sp,
                                            fontWeight = FontWeight.ExtraBold
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = zipFile.name,
                                        color = TextPrimary,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${FileItem.formatBytes(zipFile.length())} • Chạm để chọn tệp .zip này",
                                        color = CyanAccent,
                                        fontSize = 11.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Icon(Icons.Default.CheckCircleOutline, contentDescription = "Chọn tệp ZIP", tint = CyanAccent, modifier = Modifier.size(20.dp))
                            }
                            HorizontalDivider(color = DocumentsUIDivider, thickness = 0.5.dp, modifier = Modifier.padding(start = 56.dp))
                        }
                    }
                }

                HorizontalDivider(color = DocumentsUIDivider)

                // Footer
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (showZipFiles) {
                        OutlinedButton(
                            onClick = { systemZipLauncher.launch(arrayOf("application/zip", "application/x-zip-compressed", "application/octet-stream")) },
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, CyanAccent.copy(alpha = 0.6f)),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Default.FolderZip, null, tint = CyanAccent, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(5.dp))
                            Text("Chọn .ZIP hệ thống", color = CyanAccent, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onDismiss) {
                            Text("HUỶ", color = TextMuted, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                        Button(
                            onClick = { onFolderSelected(currentDir) },
                            colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Check, null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("CHỌN THƯ MỤC NÀY", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

private fun generateRandomPassword(length: Int): String {
    val chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!"
    val rnd = SecureRandom()
    return (1..length).map { chars[rnd.nextInt(chars.length)] }.joinToString("")
}
