package com.example.filemanager.utils

import android.content.ClipData
import android.content.ClipDescription
import com.example.filemanager.model.FileItem
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class CrossWindowTransferPayload(
    val sourceWindowId: String,
    val paths: List<String>
)

data class CrossWindowTransferEvent(
    val sourcePaths: List<String>,
    val targetDirectoryPath: String,
    val isMove: Boolean,
    val targetWindowId: String
)

object CrossWindowTransferBus {

    const val MIME_TYPE_FILEMANAGER_PATHS = "application/vnd.aistudio.filemanagerpro.paths"

    private val _events = MutableSharedFlow<CrossWindowTransferEvent>(extraBufferCapacity = 16)
    val events: SharedFlow<CrossWindowTransferEvent> = _events.asSharedFlow()

    fun emit(event: CrossWindowTransferEvent) {
        _events.tryEmit(event)
    }

    fun buildClipData(sourceWindowId: String, items: List<FileItem>): ClipData {
        val pathsArray = JSONArray()
        items.forEach { pathsArray.put(it.path) }
        val json = JSONObject().apply {
            put("sourceWindowId", sourceWindowId)
            put("paths", pathsArray)
        }.toString()

        val description = ClipDescription(
            "FileManagerProItems",
            arrayOf(MIME_TYPE_FILEMANAGER_PATHS, ClipDescription.MIMETYPE_TEXT_PLAIN)
        )
        return ClipData(description, ClipData.Item(json))
    }

    fun parseClipData(clipData: ClipData?): CrossWindowTransferPayload? {
        if (clipData == null || clipData.itemCount <= 0) return null
        val rawText = clipData.getItemAt(0)?.text?.toString()?.trim() ?: return null
        return try {
            val obj = JSONObject(rawText)
            val sourceWindowId = obj.optString("sourceWindowId", "")
            val pathsArray = obj.optJSONArray("paths") ?: return null
            val paths = mutableListOf<String>()
            for (i in 0 until pathsArray.length()) {
                val p = pathsArray.optString(i, "").trim()
                if (p.isNotEmpty() && File(p).exists()) {
                    paths.add(p)
                }
            }
            if (paths.isEmpty()) null else CrossWindowTransferPayload(sourceWindowId, paths)
        } catch (_: Exception) {
            null
        }
    }
}
