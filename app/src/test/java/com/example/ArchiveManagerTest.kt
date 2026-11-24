package com.example

import com.example.filemanager.archive.*
import com.example.filemanager.utils.FileUtils
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class ArchiveManagerTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    @Test
    fun fileUtilsDetectsMultiPartArchiveExtensions() {
        assertEquals("tar.gz", FileUtils.getExtension("backup.tar.gz"))
        assertEquals("tar.bz2", FileUtils.getExtension("archive.tar.bz2"))
        assertEquals("tar.xz", FileUtils.getExtension("data.tar.xz"))
        assertEquals("tar.lz4", FileUtils.getExtension("fast.tar.lz4"))
        assertEquals("tar.zstd", FileUtils.getExtension("modern.tar.zstd"))
        assertEquals("7z", FileUtils.getExtension("game.7z"))
        assertEquals("zip", FileUtils.getExtension("app.zip"))
    }

    @Test
    fun createAndExtractZipWithAes256Password() = runBlocking {
        val srcDir = tempFolder.newFolder("source_zip")
        val sampleFile = File(srcDir, "hello.txt").apply { writeText("Xin chào File Manager Pro!") }
        val outDir = tempFolder.newFolder("out_zip")
        val extractDir = tempFolder.newFolder("extract_zip")

        val config = ArchiveCompressionConfig(
            archiveFileName = "secret.zip",
            destinationDir = outDir,
            format = ArchiveFormat.ZIP,
            compressionLevel = ArchiveCompressionLevel.FAST,
            encryptionMethod = ArchiveEncryptionMethod.AES_256,
            password = "MyPassword123"
        )

        val createRes = ArchiveManager.createArchive(listOf(sampleFile), config)
        assertTrue(createRes.isSuccess)
        val zipFile = createRes.getOrThrow().single()
        assertTrue(zipFile.exists())

        val listRes = ArchiveManager.listArchiveEntries(zipFile, "MyPassword123")
        assertTrue(listRes.isSuccess)
        assertEquals(1, listRes.getOrThrow().size)

        // Wrong or missing password should fail with ArchivePasswordRequiredException
        val wrongRes = ArchiveManager.extractAll(zipFile, extractDir, null)
        assertTrue(wrongRes.isFailure)
        assertTrue(wrongRes.exceptionOrNull() is ArchivePasswordRequiredException)

        // Correct password extracts cleanly
        val extractRes = ArchiveManager.extractAll(zipFile, extractDir, "MyPassword123")
        assertTrue(extractRes.isSuccess)
        val extractedFile = File(extractDir, "hello.txt")
        assertTrue(extractedFile.exists())
        assertEquals("Xin chào File Manager Pro!", extractedFile.readText())
    }

    @Test
    fun createAndExtract7zAndTarFormats() = runBlocking {
        val srcFile = tempFolder.newFile("config.json").apply { writeText("""{"ok":true}""") }
        val outDir = tempFolder.newFolder("archives")

        for (fmt in listOf(ArchiveFormat.SEVEN_Z, ArchiveFormat.TAR, ArchiveFormat.TAR_GZ, ArchiveFormat.TAR_BZ2, ArchiveFormat.TAR_XZ, ArchiveFormat.TAR_LZ4)) {
            val archiveName = ArchiveFormat.replaceExtension("bundle", fmt)
            val config = ArchiveCompressionConfig(
                archiveFileName = archiveName,
                destinationDir = outDir,
                format = fmt,
                compressionLevel = ArchiveCompressionLevel.FAST
            )
            val created = ArchiveManager.createArchive(listOf(srcFile), config)
            assertTrue("Create failed for $fmt", created.isSuccess)
            val archiveFile = created.getOrThrow().single()

            val entries = ArchiveManager.listArchiveEntries(archiveFile)
            assertTrue("List failed for $fmt", entries.isSuccess)
            assertTrue(entries.getOrThrow().any { it.name == "config.json" })

            val targetDir = tempFolder.newFolder("extract_${fmt.name}")
            val extracted = ArchiveManager.extractAll(archiveFile, targetDir)
            assertTrue("Extract failed for $fmt", extracted.isSuccess)
            assertEquals("""{"ok":true}""", File(targetDir, "config.json").readText())
        }
    }

    @Test
    fun separateArchivesAndDeleteSource() = runBlocking {
        val workDir = tempFolder.newFolder("sep_src")
        val f1 = File(workDir, "one.txt").apply { writeText("111") }
        val f2 = File(workDir, "two.txt").apply { writeText("222") }
        val destDir = tempFolder.newFolder("sep_dest")

        val config = ArchiveCompressionConfig(
            archiveFileName = "ignored.zip",
            destinationDir = destDir,
            format = ArchiveFormat.ZIP,
            compressionLevel = ArchiveCompressionLevel.NORMAL,
            deleteSourceAfterCompression = true,
            createSeparateArchives = true
        )

        val res = ArchiveManager.createArchive(listOf(f1, f2), config)
        assertTrue(res.isSuccess)
        assertEquals(2, res.getOrThrow().size)
        assertTrue(File(destDir, "one.zip").exists())
        assertTrue(File(destDir, "two.zip").exists())
        assertFalse(f1.exists())
        assertFalse(f2.exists())
    }
}
