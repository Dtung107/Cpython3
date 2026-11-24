package com.example

import com.example.filemanager.model.FileItem
import com.example.filemanager.model.FileType
import com.example.filemanager.utils.CrossWindowTransferBus
import com.example.filemanager.utils.CrossWindowTransferEvent
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CrossWindowTransferBusTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    @Test
    fun buildAndParseClipData_preservesWindowIdAndExistingPaths() {
        val file1 = tempFolder.newFile("note.txt").apply { writeText("hello") }
        val file2 = tempFolder.newFolder("subfolder")
        val missingPath = "${tempFolder.root.absolutePath}/does_not_exist.zip"

        val items = listOf(
            FileItem(
                name = file1.name,
                path = file1.absolutePath,
                isDirectory = false,
                size = 5L,
                lastModified = 0L,
                fileType = FileType.TEXT_CODE,
                extension = "txt"
            ),
            FileItem(
                name = file2.name,
                path = file2.absolutePath,
                isDirectory = true,
                size = 0L,
                lastModified = 0L,
                fileType = FileType.FOLDER,
                extension = ""
            ),
            FileItem(
                name = "does_not_exist.zip",
                path = missingPath,
                isDirectory = false,
                size = 0L,
                lastModified = 0L,
                fileType = FileType.ARCHIVE,
                extension = "zip"
            )
        )

        val clipData = CrossWindowTransferBus.buildClipData("window-top-1", items)
        assertTrue(clipData.description.hasMimeType(CrossWindowTransferBus.MIME_TYPE_FILEMANAGER_PATHS))

        val parsed = CrossWindowTransferBus.parseClipData(clipData)
        assertNotNull(parsed)
        assertEquals("window-top-1", parsed!!.sourceWindowId)
        assertEquals(listOf(file1.absolutePath, file2.absolutePath), parsed.paths)
    }

    @Test
    fun parseClipData_returnsNullForNullOrInvalidPayload() {
        assertNull(CrossWindowTransferBus.parseClipData(null))
        assertNull(
            CrossWindowTransferBus.parseClipData(
                android.content.ClipData.newPlainText("text", "not json")
            )
        )
    }

    @Test
    fun emit_deliversCrossWindowTransferEventToSubscribers() = runTest {
        val targetEvent = CrossWindowTransferEvent(
            sourcePaths = listOf("/storage/emulated/0/Documents/a.txt"),
            targetDirectoryPath = "/storage/emulated/0/log",
            isMove = true,
            targetWindowId = "window-bottom-2"
        )
        val deferred = async(start = kotlinx.coroutines.CoroutineStart.UNDISPATCHED) {
            CrossWindowTransferBus.events.first { it.targetWindowId == "window-bottom-2" }
        }
        CrossWindowTransferBus.emit(targetEvent)
        val received = deferred.await()
        assertEquals(targetEvent, received)
    }
}
