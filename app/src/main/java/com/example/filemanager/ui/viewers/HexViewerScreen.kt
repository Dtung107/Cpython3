package com.example.filemanager.ui.viewers

import androidx.compose.runtime.Composable
import java.io.File

/**
 * Full-screen wrapper providing the read-only Hex viewer component
 */
@Composable
fun HexViewerScreen(
    file: File,
    onBack: () -> Unit,
    onOpenTextViewer: ((File) -> Unit)? = null
) {
    ReadOnlyHexViewer(
        file = file,
        onClose = onBack,
        onOpenTextViewer = onOpenTextViewer
    )
}
