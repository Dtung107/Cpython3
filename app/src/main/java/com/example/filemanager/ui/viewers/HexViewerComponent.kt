package com.example.filemanager.ui.viewers

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.filemanager.model.FileItem
import com.example.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile

/**
 * Data model representing a single row in the read-only Hex grid
 */
data class HexGridRow(
    val offset: Long,
    val offsetHex: String,
    val bytes: List<Byte>,
    val hexTokens: List<String>,
    val asciiChars: List<Char>
)

/**
 * Selected byte inspector model for in-depth read-only analysis
 */
data class SelectedByteInfo(
    val globalOffset: Long,
    val byteValue: Byte
) {
    val unsignedInt: Int get() = byteValue.toInt() and 0xFF
    val hexString: String get() = "%02X".format(unsignedInt)
    val binaryString: String get() = String.format("%8s", Integer.toBinaryString(unsignedInt)).replace(' ', '0')
    val octalString: String get() = Integer.toOctalString(unsignedInt)
    val asciiChar: String get() = if (unsignedInt in 32..126) "'${unsignedInt.toChar()}'" else "Không in được (·)"
}

/**
 * Pure utility function to parse an arbitrary byte array into aligned hex grid rows
 */
fun parseByteArrayToHexGridRows(
    byteArray: ByteArray,
    baseOffset: Long = 0L,
    bytesPerRow: Int = 16
): List<HexGridRow> {
    if (byteArray.isEmpty()) return emptyList()

    val total = byteArray.size
    val rows = ArrayList<HexGridRow>((total + bytesPerRow - 1) / bytesPerRow)
    var i = 0

    while (i < total) {
        val rowOffset = baseOffset + i
        val rowLen = minOf(bytesPerRow, total - i)
        val rowBytes = ArrayList<Byte>(rowLen)
        val hexTokens = ArrayList<String>(bytesPerRow)
        val asciiChars = ArrayList<Char>(bytesPerRow)

        for (bIdx in 0 until bytesPerRow) {
            if (bIdx < rowLen) {
                val b = byteArray[i + bIdx]
                rowBytes.add(b)
                val u = b.toInt() and 0xFF
                hexTokens.add("%02X".format(u))
                if (u in 32..126) {
                    asciiChars.add(u.toChar())
                } else {
                    asciiChars.add('·')
                }
            } else {
                hexTokens.add("  ")
                asciiChars.add(' ')
            }
        }

        rows.add(
            HexGridRow(
                offset = rowOffset,
                offsetHex = "%08X".format(rowOffset),
                bytes = rowBytes,
                hexTokens = hexTokens,
                asciiChars = asciiChars
            )
        )
        i += bytesPerRow
    }
    return rows
}

/**
 * Read-only Hex viewer component that reads a file as a byte array and displays it
 * in a grid format with offset, hex values, and ASCII representations.
 */
@Composable
fun ReadOnlyHexViewer(
    file: File,
    modifier: Modifier = Modifier,
    pageSizeBytes: Int = 1024, // 1KB per page (64 rows of 16 bytes)
    onClose: (() -> Unit)? = null,
    onOpenTextViewer: ((File) -> Unit)? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }

    var currentBytes by remember { mutableStateOf<ByteArray?>(null) }
    var currentRows by remember { mutableStateOf<List<HexGridRow>>(emptyList()) }
    var currentPageIndex by remember { mutableIntStateOf(0) }
    var totalPages by remember { mutableIntStateOf(1) }
    var totalFileSize by remember { mutableLongStateOf(0L) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    var selectedByte by remember { mutableStateOf<SelectedByteInfo?>(null) }
    var showJumpDialog by remember { mutableStateOf(false) }
    var jumpInput by remember { mutableStateOf("") }

    var showHeaderInfoDialog by remember { mutableStateOf(false) }
    var headerAnalysisText by remember { mutableStateOf("") }

    var showSearchDialog by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var isHexSearch by remember { mutableStateOf(false) }
    var isSearching by remember { mutableStateOf(false) }
    var searchMatches by remember { mutableStateOf<List<Long>>(emptyList()) }

    // Read file slice as a byte array on IO thread
    fun loadPage(page: Int) {
        isLoading = true
        errorMessage = null
        selectedByte = null

        coroutineScope.launch {
            try {
                val (bytesRead, size, pages, calculatedPage) = withContext(Dispatchers.IO) {
                    if (!file.exists() || !file.canRead()) {
                        throw IllegalArgumentException("Không thể mở tệp để đọc dữ liệu nhị phân")
                    }
                    val size = file.length()
                    if (size == 0L) {
                        return@withContext Tuple4(ByteArray(0), 0L, 1, 0)
                    }
                    val pages = (((size - 1) / pageSizeBytes) + 1).toInt()
                    val targetPage = page.coerceIn(0, (pages - 1).coerceAtLeast(0))
                    val startOffset = targetPage.toLong() * pageSizeBytes
                    val toRead = minOf(pageSizeBytes.toLong(), size - startOffset).toInt()

                    val buffer = ByteArray(toRead)
                    RandomAccessFile(file, "r").use { raf ->
                        raf.seek(startOffset)
                        raf.readFully(buffer)
                    }
                    Tuple4(buffer, size, pages, targetPage)
                }

                currentBytes = bytesRead
                totalFileSize = size
                totalPages = pages
                currentPageIndex = calculatedPage
                currentRows = parseByteArrayToHexGridRows(
                    byteArray = bytesRead,
                    baseOffset = calculatedPage.toLong() * pageSizeBytes,
                    bytesPerRow = 16
                )
            } catch (e: Exception) {
                errorMessage = e.message ?: "Lỗi khi đọc dữ liệu tệp nhị phân"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(file) {
        loadPage(0)
    }

    Surface(
        color = CharcoalBackground,
        modifier = modifier.fillMaxSize()
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Read-Only Toolbar info
            Surface(
                color = CharcoalSurface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (onClose != null) {
                            IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Đóng", tint = TextPrimary)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = file.name,
                                    color = TextPrimary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = ElectricBlue.copy(alpha = 0.2f),
                                    border = androidx.compose.foundation.BorderStroke(0.8.dp, ElectricBlue.copy(alpha = 0.5f))
                                ) {
                                    Text(
                                        text = "READ-ONLY",
                                        color = CyanAccent,
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                    )
                                }
                            }
                            Text(
                                text = "${FileItem.formatBytes(totalFileSize)} • Khối ${currentPageIndex + 1} / $totalPages",
                                color = TextMuted,
                                fontSize = 11.sp
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Header Analysis button
                        IconButton(
                            onClick = {
                                headerAnalysisText = com.example.filemanager.binary.HexEditor.getHeaderAnalysis(file)
                                showHeaderInfoDialog = true
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Info, contentDescription = "Phân tích Header", tint = TextPrimary)
                        }

                        // Search Hex / Text
                        IconButton(
                            onClick = { showSearchDialog = true },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Search, contentDescription = "Tìm kiếm Hex/Text", tint = TextPrimary)
                        }

                        // Jump to offset button
                        IconButton(onClick = { showJumpDialog = true }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.DoubleArrow, contentDescription = "Nhảy đến Offset", tint = CyanAccent)
                        }

                        // Copy current page hex button
                        IconButton(
                            onClick = {
                                val hexDump = currentRows.joinToString("\n") { row ->
                                    "${row.offsetHex}  ${row.hexTokens.joinToString(" ")}  |${row.asciiChars.joinToString("")}|"
                                }
                                clipboardManager.setText(AnnotatedString(hexDump))
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.ContentCopy, contentDescription = "Sao chép khối HEX", tint = TextPrimary)
                        }

                        // Switch to Text Viewer
                        if (onOpenTextViewer != null) {
                            IconButton(onClick = { onOpenTextViewer(file) }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Default.Article, contentDescription = "Xem dạng Văn bản", tint = ColorSuccessGreen)
                            }
                        }
                    }
                }
            }

            // Main Content Area
            if (isLoading) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = ElectricBlue)
                }
            } else if (errorMessage != null) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(text = errorMessage ?: "", color = ColorErrorRed, textAlign = TextAlign.Center)
                }
            } else if (currentRows.isEmpty()) {
                Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("Tệp không có dữ liệu (0 bytes)", color = TextMuted)
                }
            } else {
                val hScrollState = rememberScrollState()

                Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    // Grid Header with column indicators
                    Surface(
                        color = CharcoalSurfaceHighlight,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .horizontalScroll(hScrollState)
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Offset Column Header
                            Text(
                                text = "OFFSET",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = CyanAccent,
                                modifier = Modifier.width(82.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))

                            // 16 Hex Column Headers: 00..07 and 08..0F
                            Row(modifier = Modifier.width(368.dp)) {
                                for (col in 0 until 16) {
                                    Text(
                                        text = "%02X".format(col),
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (col < 8) ElectricBlue else Color(0xFF64B5F6),
                                        textAlign = TextAlign.Center,
                                        modifier = Modifier.width(22.dp)
                                    )
                                    if (col == 7) {
                                        Spacer(modifier = Modifier.width(8.dp)) // Middle split gap
                                    } else if (col < 15) {
                                        Spacer(modifier = Modifier.width(1.dp))
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))

                            // ASCII Header
                            Text(
                                text = "ASCII (DECODED)",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.5.sp,
                                fontWeight = FontWeight.Bold,
                                color = ColorWarningAmber,
                                modifier = Modifier.width(140.dp)
                            )
                        }
                    }

                    // Hex Rows in Virtualized Scrollable LazyColumn
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        Row(modifier = Modifier.fillMaxSize().horizontalScroll(hScrollState)) {
                            LazyColumn(
                                modifier = Modifier.fillMaxHeight(),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                itemsIndexed(currentRows) { _, row ->
                                    HexRowItem(
                                        row = row,
                                        selectedByteOffset = selectedByte?.globalOffset,
                                        onByteSelected = { globalOffset, byteVal ->
                                            selectedByte = SelectedByteInfo(globalOffset, byteVal)
                                        }
                                    )
                                    HorizontalDivider(color = CharcoalDivider.copy(alpha = 0.4f), thickness = 0.5.dp)
                                }
                            }
                        }
                    }
                }
            }

            // Bottom Selected Byte Inspector Bar
            selectedByte?.let { sel ->
                Surface(
                    color = CharcoalSurfaceVariant,
                    shape = RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, ElectricBlue.copy(alpha = 0.5f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Offset: 0x%08X (%d)".format(sel.globalOffset, sel.globalOffset),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.5.sp,
                                color = CyanAccent,
                                fontWeight = FontWeight.Bold
                            )
                            Row {
                                TextButton(
                                    onClick = {
                                        clipboardManager.setText(AnnotatedString("0x${sel.hexString}"))
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                    modifier = Modifier.height(26.dp)
                                ) {
                                    Text("Chép HEX", fontSize = 10.5.sp, color = ElectricBlue)
                                }
                                TextButton(
                                    onClick = { selectedByte = null },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                    modifier = Modifier.height(26.dp)
                                ) {
                                    Text("Đóng", fontSize = 10.5.sp, color = TextMuted)
                                }
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Text(
                                text = "Hex: 0x${sel.hexString}",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = TextPrimary
                            )
                            Text(
                                text = "Dec: ${sel.unsignedInt}",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = TextPrimary
                            )
                            Text(
                                text = "Bin: ${sel.binaryString}",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = TextPrimary
                            )
                            Text(
                                text = "Char: ${sel.asciiChar}",
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp,
                                color = ColorSuccessGreen
                            )
                        }
                    }
                }
            }

            // Pagination Footer Bar
            Surface(
                color = CharcoalSurface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    FilledTonalButton(
                        onClick = { if (currentPageIndex > 0) loadPage(currentPageIndex - 1) },
                        enabled = currentPageIndex > 0,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Khối trước", fontSize = 11.5.sp)
                    }

                    Text(
                        text = "Khối ${currentPageIndex + 1} / $totalPages",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        fontSize = 11.5.sp
                    )

                    FilledTonalButton(
                        onClick = { if (currentPageIndex + 1 < totalPages) loadPage(currentPageIndex + 1) },
                        enabled = currentPageIndex + 1 < totalPages,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        modifier = Modifier.height(34.dp)
                    ) {
                        Text("Khối sau", fontSize = 11.5.sp)
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(Icons.Default.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }

    // Dialog: Jump to offset
    if (showJumpDialog) {
        AlertDialog(
            onDismissRequest = { showJumpDialog = false },
            title = { Text("Chuyển đến Offset", color = TextPrimary) },
            text = {
                Column {
                    Text(
                        text = "Nhập địa chỉ Offset thập lục phân (Hex, vd: 1A0, 0x200) hoặc thập phân (vd: 512):",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = jumpInput,
                        onValueChange = { jumpInput = it },
                        placeholder = { Text("Ví dụ: 0x100 hoặc 256", color = TextMuted) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ElectricBlue,
                            unfocusedBorderColor = CharcoalSurfaceHighlight,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showJumpDialog = false
                        try {
                            val targetOffset = if (jumpInput.startsWith("0x", ignoreCase = true)) {
                                jumpInput.substring(2).toLong(16)
                            } else if (jumpInput.all { it.isDigit() }) {
                                jumpInput.toLong()
                            } else {
                                jumpInput.toLong(16)
                            }
                            val targetPage = (targetOffset / pageSizeBytes).toInt()
                            loadPage(targetPage)
                        } catch (_: Exception) { }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Đi tới")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJumpDialog = false }) {
                    Text("Hủy", color = TextMuted)
                }
            },
            containerColor = CharcoalSurface
        )
    }

    // Dialog: Header Analysis
    if (showHeaderInfoDialog) {
        AlertDialog(
            onDismissRequest = { showHeaderInfoDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, contentDescription = null, tint = CyanAccent)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Phân tích Header tệp", color = TextPrimary)
                }
            },
            text = {
                Column {
                    Surface(
                        color = CharcoalSurfaceVariant,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    ) {
                        Text(
                            text = headerAnalysisText,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 12.sp,
                            color = TextPrimary,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { showHeaderInfoDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue)
                ) {
                    Text("Đóng")
                }
            },
            containerColor = CharcoalSurface
        )
    }

    // Dialog: Search Hex / Text
    if (showSearchDialog) {
        AlertDialog(
            onDismissRequest = { showSearchDialog = false },
            title = { Text("Tìm kiếm trong tệp nhị phân", color = TextPrimary) },
            text = {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilterChip(
                            selected = !isHexSearch,
                            onClick = { isHexSearch = false },
                            label = { Text("Văn bản ASCII") }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        FilterChip(
                            selected = isHexSearch,
                            onClick = { isHexSearch = true },
                            label = { Text("Chuỗi HEX") }
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = {
                            Text(if (isHexSearch) "Ví dụ: 4D 5A hoặc 504B" else "Ví dụ: PNG, PK, header...", color = TextMuted)
                        },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ElectricBlue,
                            unfocusedBorderColor = CharcoalSurfaceHighlight,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (isSearching) {
                        Spacer(modifier = Modifier.height(8.dp))
                        LinearProgressIndicator(color = ElectricBlue, modifier = Modifier.fillMaxWidth())
                    } else if (searchMatches.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Tìm thấy ${searchMatches.size} kết quả:", color = ColorSuccessGreen, fontSize = 12.sp)
                        LazyColumn(modifier = Modifier.heightIn(max = 120.dp)) {
                            itemsIndexed(searchMatches) { _, matchOffset ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            showSearchDialog = false
                                            val targetPage = (matchOffset / pageSizeBytes).toInt()
                                            loadPage(targetPage)
                                        }
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("0x%08X".format(matchOffset), fontFamily = FontFamily.Monospace, color = CyanAccent, fontSize = 12.sp)
                                    Text("Offset $matchOffset", color = TextMuted, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (searchQuery.isNotBlank()) {
                            isSearching = true
                            coroutineScope.launch {
                                val res = com.example.filemanager.binary.HexEditor.searchPattern(file, searchQuery, isHexSearch)
                                searchMatches = res.getOrDefault(emptyList())
                                isSearching = false
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricBlue),
                    enabled = !isSearching && searchQuery.isNotBlank()
                ) {
                    Text("Tìm kiếm")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSearchDialog = false }) {
                    Text("Đóng", color = TextMuted)
                }
            },
            containerColor = CharcoalSurface
        )
    }
}

/**
 * Individual Row rendering Offset, 16 Hex Byte Cells, and 16 ASCII Characters
 */
@Composable
private fun HexRowItem(
    row: HexGridRow,
    selectedByteOffset: Long?,
    onByteSelected: (Long, Byte) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Offset chip
        Text(
            text = row.offsetHex,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            color = CyanAccent,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.width(82.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))

        // Hex Byte Values (00..07 and 08..0F)
        Row(modifier = Modifier.width(368.dp), verticalAlignment = Alignment.CenterVertically) {
            for (col in 0 until 16) {
                val hexStr = row.hexTokens[col]
                val byteOffset = row.offset + col
                val isSelected = selectedByteOffset == byteOffset && col < row.bytes.size

                val bgColor = if (isSelected) ElectricBlue else Color.Transparent
                val textColor = if (isSelected) {
                    Color.White
                } else if (col < row.bytes.size) {
                    val bVal = row.bytes[col].toInt() and 0xFF
                    if (bVal == 0) TextMuted else TextPrimary
                } else {
                    Color.Transparent
                }

                Box(
                    modifier = Modifier
                        .width(22.dp)
                        .height(20.dp)
                        .background(bgColor, shape = RoundedCornerShape(2.dp))
                        .clickable(enabled = col < row.bytes.size) {
                            if (col < row.bytes.size) {
                                onByteSelected(byteOffset, row.bytes[col])
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = hexStr,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        color = textColor,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        textAlign = TextAlign.Center
                    )
                }

                if (col == 7) {
                    Spacer(modifier = Modifier.width(8.dp)) // Middle split gap
                } else if (col < 15) {
                    Spacer(modifier = Modifier.width(1.dp))
                }
            }
        }
        Spacer(modifier = Modifier.width(12.dp))

        // ASCII Representation
        Row(
            modifier = Modifier
                .width(140.dp)
                .background(CharcoalSurfaceVariant.copy(alpha = 0.5f), shape = RoundedCornerShape(3.dp))
                .padding(horizontal = 4.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (col in 0 until 16) {
                val ch = row.asciiChars[col]
                val byteOffset = row.offset + col
                val isSelected = selectedByteOffset == byteOffset && col < row.bytes.size

                val charColor = if (isSelected) {
                    ElectricBlue
                } else if (ch == '·') {
                    TextMuted
                } else {
                    ColorSuccessGreen
                }

                Text(
                    text = ch.toString(),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.5.sp,
                    color = charColor,
                    fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Normal,
                    modifier = Modifier.width(8.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/**
 * Lightweight helper tuple
 */
private data class Tuple4<A, B, C, D>(
    val first: A,
    val second: B,
    val third: C,
    val fourth: D
)
