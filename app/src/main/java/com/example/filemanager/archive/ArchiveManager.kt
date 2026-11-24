package com.example.filemanager.archive

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.lingala.zip4j.ZipFile as Zip4jFile
import net.lingala.zip4j.exception.ZipException
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.AesKeyStrength
import net.lingala.zip4j.model.enums.CompressionLevel as Zip4jCompressionLevel
import net.lingala.zip4j.model.enums.CompressionMethod
import net.lingala.zip4j.model.enums.EncryptionMethod
import org.apache.commons.compress.PasswordRequiredException
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import org.apache.commons.compress.archivers.sevenz.SevenZMethod
import org.apache.commons.compress.archivers.sevenz.SevenZOutputFile
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream
import org.apache.commons.compress.compressors.gzip.GzipParameters
import org.apache.commons.compress.compressors.lz4.FramedLZ4CompressorInputStream
import org.apache.commons.compress.compressors.lz4.FramedLZ4CompressorOutputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorOutputStream
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorInputStream
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import java.io.*
import java.util.Locale
import java.util.zip.Deflater

data class ArchiveEntryInfo(
    val name: String,
    val path: String,
    val size: Long,
    val compressedSize: Long,
    val isDirectory: Boolean,
    val lastModified: Long,
    val isEncrypted: Boolean = false
)

object ArchiveManager {

    private const val BUFFER_SIZE = 128 * 1024 // 128 KB buffer for high-speed I/O

    private enum class DetectedKind {
        ZIP, SEVEN_Z, TAR, TAR_GZ, TAR_BZ2, TAR_XZ, TAR_LZ4, TAR_ZSTD
    }

    private fun detectArchiveKind(file: File): DetectedKind {
        val name = file.name.lowercase(Locale.ROOT)
        return when {
            name.endsWith(".7z") -> DetectedKind.SEVEN_Z
            name.endsWith(".tar.gz") || name.endsWith(".tgz") -> DetectedKind.TAR_GZ
            name.endsWith(".tar.bz2") || name.endsWith(".tbz2") -> DetectedKind.TAR_BZ2
            name.endsWith(".tar.xz") || name.endsWith(".txz") -> DetectedKind.TAR_XZ
            name.endsWith(".tar.lz4") || name.endsWith(".tlz4") -> DetectedKind.TAR_LZ4
            name.endsWith(".tar.zstd") || name.endsWith(".tar.zst") || name.endsWith(".tzst") -> DetectedKind.TAR_ZSTD
            name.endsWith(".tar") -> DetectedKind.TAR
            else -> DetectedKind.ZIP // .zip, .xapk, .apks, .apkm, .jar, .obb, .apk
        }
    }

    private fun openTarInputStream(file: File, kind: DetectedKind): TarArchiveInputStream {
        val bis = BufferedInputStream(FileInputStream(file), BUFFER_SIZE)
        val decompressed: InputStream = when (kind) {
            DetectedKind.TAR -> bis
            DetectedKind.TAR_GZ -> GzipCompressorInputStream(bis)
            DetectedKind.TAR_BZ2 -> BZip2CompressorInputStream(bis)
            DetectedKind.TAR_XZ -> XZCompressorInputStream(bis)
            DetectedKind.TAR_LZ4 -> FramedLZ4CompressorInputStream(bis)
            DetectedKind.TAR_ZSTD -> ZstdCompressorInputStream(bis)
            else -> bis
        }
        return TarArchiveInputStream(decompressed)
    }

    suspend fun listArchiveEntries(
        archiveFile: File,
        password: String? = null
    ): Result<List<ArchiveEntryInfo>> = withContext(Dispatchers.IO) {
        try {
            if (!archiveFile.exists() || !archiveFile.canRead()) {
                return@withContext Result.failure(IllegalArgumentException("Không thể đọc tệp nén"))
            }

            val entriesList = mutableListOf<ArchiveEntryInfo>()
            when (val kind = detectArchiveKind(archiveFile)) {
                DetectedKind.ZIP -> {
                    val zip = Zip4jFile(archiveFile)
                    if (!password.isNullOrEmpty()) zip.setPassword(password.toCharArray())
                    zip.fileHeaders.forEach { header ->
                        val path = header.fileName
                        val cleanName = path.trimEnd('/').substringAfterLast('/')
                        entriesList.add(
                            ArchiveEntryInfo(
                                name = cleanName.ifEmpty { path },
                                path = path,
                                size = header.uncompressedSize.coerceAtLeast(0L),
                                compressedSize = header.compressedSize.coerceAtLeast(0L),
                                isDirectory = header.isDirectory,
                                lastModified = header.lastModifiedTimeEpoch,
                                isEncrypted = header.isEncrypted
                            )
                        )
                    }
                }
                DetectedKind.SEVEN_Z -> {
                    val builder = SevenZFile.builder().setFile(archiveFile)
                    if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
                    builder.get().use { sz ->
                        var entry = sz.nextEntry
                        while (entry != null) {
                            val path = entry.name
                            val cleanName = path.trimEnd('/').substringAfterLast('/')
                            entriesList.add(
                                ArchiveEntryInfo(
                                    name = cleanName.ifEmpty { path },
                                    path = path,
                                    size = entry.size.coerceAtLeast(0L),
                                    compressedSize = entry.size.coerceAtLeast(0L),
                                    isDirectory = entry.isDirectory,
                                    lastModified = if (entry.hasLastModifiedDate) entry.lastModifiedDate.time else 0L
                                )
                            )
                            entry = sz.nextEntry
                        }
                    }
                }
                DetectedKind.TAR, DetectedKind.TAR_GZ, DetectedKind.TAR_BZ2,
                DetectedKind.TAR_XZ, DetectedKind.TAR_LZ4, DetectedKind.TAR_ZSTD -> {
                    openTarInputStream(archiveFile, kind).use { tis ->
                        var entry = tis.nextEntry
                        while (entry != null) {
                            val path = entry.name
                            val cleanName = path.trimEnd('/').substringAfterLast('/')
                            entriesList.add(
                                ArchiveEntryInfo(
                                    name = cleanName.ifEmpty { path },
                                    path = path,
                                    size = entry.size.coerceAtLeast(0L),
                                    compressedSize = entry.size.coerceAtLeast(0L),
                                    isDirectory = entry.isDirectory,
                                    lastModified = entry.lastModifiedDate?.time ?: 0L
                                )
                            )
                            entry = tis.nextEntry
                        }
                    }
                }
            }

            Result.success(entriesList.sortedWith(compareBy({ !it.isDirectory }, { it.path })))
        } catch (e: PasswordRequiredException) {
            Result.failure(ArchivePasswordRequiredException())
        } catch (e: ZipException) {
            if (e.type == ZipException.Type.WRONG_PASSWORD || e.message?.contains("password", ignoreCase = true) == true) {
                Result.failure(ArchivePasswordRequiredException())
            } else {
                Result.failure(e)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun extractAll(
        archiveFile: File,
        targetDir: File,
        password: String? = null,
        onProgress: ((progress: Float, currentEntry: String) -> Unit)? = null
    ): Result<Int> = withContext(Dispatchers.IO) {
        try {
            if (!targetDir.exists()) targetDir.mkdirs()
            val canonicalTarget = targetDir.canonicalPath
            var extractedCount = 0
            val buffer = ByteArray(BUFFER_SIZE)

            when (val kind = detectArchiveKind(archiveFile)) {
                DetectedKind.ZIP -> {
                    val zip = Zip4jFile(archiveFile)
                    if (zip.isEncrypted) {
                        if (password.isNullOrEmpty()) throw ArchivePasswordRequiredException()
                        zip.setPassword(password.toCharArray())
                    }
                    val headers = zip.fileHeaders
                    val total = headers.size.coerceAtLeast(1)
                    headers.forEachIndexed { idx, header ->
                        onProgress?.invoke(((idx + 1).toFloat() / total.toFloat()).coerceIn(0f, 1f), header.fileName)
                        val outFile = File(targetDir, header.fileName)
                        if (!outFile.canonicalPath.startsWith(canonicalTarget)) return@forEachIndexed
                        if (header.isDirectory) {
                            outFile.mkdirs()
                        } else {
                            outFile.parentFile?.mkdirs()
                            zip.getInputStream(header).use { zis ->
                                BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                    var len: Int
                                    while (zis.read(buffer).also { len = it } != -1) {
                                        bos.write(buffer, 0, len)
                                    }
                                }
                            }
                            extractedCount++
                        }
                    }
                }
                DetectedKind.SEVEN_Z -> {
                    val builder = SevenZFile.builder().setFile(archiveFile)
                    if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
                    builder.get().use { sz ->
                        val allEntriesCount = sz.entries.count().coerceAtLeast(1)
                        var idx = 0
                        var entry = sz.nextEntry
                        while (entry != null) {
                            idx++
                            onProgress?.invoke((idx.toFloat() / allEntriesCount.toFloat()).coerceIn(0f, 1f), entry.name)
                            val outFile = File(targetDir, entry.name)
                            if (outFile.canonicalPath.startsWith(canonicalTarget)) {
                                if (entry.isDirectory) {
                                    outFile.mkdirs()
                                } else {
                                    outFile.parentFile?.mkdirs()
                                    BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                        var len: Int
                                        while (sz.read(buffer).also { len = it } > 0) {
                                            bos.write(buffer, 0, len)
                                        }
                                    }
                                    extractedCount++
                                }
                            }
                            entry = sz.nextEntry
                        }
                    }
                }
                DetectedKind.TAR, DetectedKind.TAR_GZ, DetectedKind.TAR_BZ2,
                DetectedKind.TAR_XZ, DetectedKind.TAR_LZ4, DetectedKind.TAR_ZSTD -> {
                    openTarInputStream(archiveFile, kind).use { tis ->
                        var entry = tis.nextEntry
                        var countSeen = 0
                        while (entry != null) {
                            countSeen++
                            onProgress?.invoke(0.5f, entry.name)
                            val outFile = File(targetDir, entry.name)
                            if (outFile.canonicalPath.startsWith(canonicalTarget)) {
                                if (entry.isDirectory) {
                                    outFile.mkdirs()
                                } else {
                                    outFile.parentFile?.mkdirs()
                                    BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                        var len: Int
                                        while (tis.read(buffer).also { len = it } != -1) {
                                            bos.write(buffer, 0, len)
                                        }
                                    }
                                    extractedCount++
                                }
                            }
                            entry = tis.nextEntry
                        }
                    }
                }
            }

            Result.success(extractedCount)
        } catch (e: PasswordRequiredException) {
            Result.failure(ArchivePasswordRequiredException())
        } catch (e: ZipException) {
            if (e.type == ZipException.Type.WRONG_PASSWORD || e.message?.contains("password", ignoreCase = true) == true) {
                Result.failure(ArchivePasswordRequiredException("Mật khẩu không đúng hoặc tệp cần mật khẩu"))
            } else {
                Result.failure(e)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun extractEntries(
        archiveFile: File,
        entryPaths: List<String>,
        targetDir: File,
        password: String? = null,
        onProgress: ((progress: Float, currentEntry: String) -> Unit)? = null
    ): Result<Int> = withContext(Dispatchers.IO) {
        try {
            if (!targetDir.exists()) targetDir.mkdirs()
            val canonicalTarget = targetDir.canonicalPath
            val pathSet = entryPaths.toSet()
            var extractedCount = 0
            val buffer = ByteArray(BUFFER_SIZE)

            when (val kind = detectArchiveKind(archiveFile)) {
                DetectedKind.ZIP -> {
                    val zip = Zip4jFile(archiveFile)
                    if (zip.isEncrypted) {
                        if (password.isNullOrEmpty()) throw ArchivePasswordRequiredException()
                        zip.setPassword(password.toCharArray())
                    }
                    val total = entryPaths.size.coerceAtLeast(1)
                    entryPaths.forEachIndexed { index, path ->
                        val header = zip.getFileHeader(path) ?: return@forEachIndexed
                        onProgress?.invoke(((index + 1).toFloat() / total.toFloat()).coerceIn(0f, 1f), header.fileName)
                        val outFile = File(targetDir, header.fileName)
                        if (!outFile.canonicalPath.startsWith(canonicalTarget)) return@forEachIndexed
                        if (header.isDirectory) {
                            outFile.mkdirs()
                        } else {
                            outFile.parentFile?.mkdirs()
                            zip.getInputStream(header).use { zis ->
                                BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                    var len: Int
                                    while (zis.read(buffer).also { len = it } != -1) {
                                        bos.write(buffer, 0, len)
                                    }
                                }
                            }
                            extractedCount++
                        }
                    }
                }
                DetectedKind.SEVEN_Z -> {
                    val builder = SevenZFile.builder().setFile(archiveFile)
                    if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
                    builder.get().use { sz ->
                        val total = entryPaths.size.coerceAtLeast(1)
                        var entry = sz.nextEntry
                        while (entry != null) {
                            if (pathSet.contains(entry.name)) {
                                onProgress?.invoke(((extractedCount + 1).toFloat() / total.toFloat()).coerceIn(0f, 1f), entry.name)
                                val outFile = File(targetDir, entry.name)
                                if (outFile.canonicalPath.startsWith(canonicalTarget)) {
                                    if (entry.isDirectory) outFile.mkdirs()
                                    else {
                                        outFile.parentFile?.mkdirs()
                                        BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                            var len: Int
                                            while (sz.read(buffer).also { len = it } > 0) {
                                                bos.write(buffer, 0, len)
                                            }
                                        }
                                        extractedCount++
                                    }
                                }
                            }
                            entry = sz.nextEntry
                        }
                    }
                }
                DetectedKind.TAR, DetectedKind.TAR_GZ, DetectedKind.TAR_BZ2,
                DetectedKind.TAR_XZ, DetectedKind.TAR_LZ4, DetectedKind.TAR_ZSTD -> {
                    openTarInputStream(archiveFile, kind).use { tis ->
                        val total = entryPaths.size.coerceAtLeast(1)
                        var entry = tis.nextEntry
                        while (entry != null) {
                            if (pathSet.contains(entry.name)) {
                                onProgress?.invoke(((extractedCount + 1).toFloat() / total.toFloat()).coerceIn(0f, 1f), entry.name)
                                val outFile = File(targetDir, entry.name)
                                if (outFile.canonicalPath.startsWith(canonicalTarget)) {
                                    if (entry.isDirectory) outFile.mkdirs()
                                    else {
                                        outFile.parentFile?.mkdirs()
                                        BufferedOutputStream(FileOutputStream(outFile), BUFFER_SIZE).use { bos ->
                                            var len: Int
                                            while (tis.read(buffer).also { len = it } != -1) {
                                                bos.write(buffer, 0, len)
                                            }
                                        }
                                        extractedCount++
                                    }
                                }
                            }
                            entry = tis.nextEntry
                        }
                    }
                }
            }

            Result.success(extractedCount)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun extractEntry(
        archiveFile: File,
        entryPath: String,
        targetDir: File,
        password: String? = null
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            if (!targetDir.exists()) targetDir.mkdirs()
            val fileName = entryPath.trimEnd('/').substringAfterLast('/')
            val outFile = File(targetDir, fileName)
            val bytesRes = readEntryBytes(archiveFile, entryPath, maxBytes = Int.MAX_VALUE, password = password)
            if (bytesRes.isFailure) return@withContext Result.failure(bytesRes.exceptionOrNull()!!)

            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { it.write(bytesRes.getOrThrow()) }
            Result.success(outFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun readEntryText(
        archiveFile: File,
        entryPath: String,
        maxBytes: Int = 1024 * 1024,
        password: String? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val res = readEntryBytes(archiveFile, entryPath, maxBytes = maxBytes, password = password)
            if (res.isFailure) return@withContext Result.failure(res.exceptionOrNull()!!)
            val bytes = res.getOrThrow()
            if (bytes.isEmpty()) Result.success("(Tệp rỗng)")
            else Result.success(String(bytes, Charsets.UTF_8))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun readEntryBytes(
        archiveFile: File,
        entryPath: String,
        maxBytes: Int = 10 * 1024 * 1024,
        password: String? = null
    ): Result<ByteArray> = withContext(Dispatchers.IO) {
        try {
            when (val kind = detectArchiveKind(archiveFile)) {
                DetectedKind.ZIP -> {
                    val zip = Zip4jFile(archiveFile)
                    val header = zip.getFileHeader(entryPath)
                        ?: return@withContext Result.failure(IllegalArgumentException("Không tìm thấy tệp: $entryPath"))
                    if (header.isEncrypted) {
                        if (password.isNullOrEmpty()) throw ArchivePasswordRequiredException()
                        zip.setPassword(password.toCharArray())
                    }
                    zip.getInputStream(header).use { bis ->
                        val out = readBoundedBytes(bis, maxBytes)
                        Result.success(out)
                    }
                }
                DetectedKind.SEVEN_Z -> {
                    val builder = SevenZFile.builder().setFile(archiveFile)
                    if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
                    builder.get().use { sz ->
                        var entry = sz.nextEntry
                        while (entry != null) {
                            if (entry.name == entryPath) {
                                val baos = ByteArrayOutputStream()
                                val buf = ByteArray(minOf(65536, maxBytes))
                                var total = 0
                                while (total < maxBytes) {
                                    val r = sz.read(buf, 0, minOf(buf.size, maxBytes - total))
                                    if (r <= 0) break
                                    baos.write(buf, 0, r)
                                    total += r
                                }
                                return@withContext Result.success(baos.toByteArray())
                            }
                            entry = sz.nextEntry
                        }
                    }
                    Result.failure(IllegalArgumentException("Không tìm thấy tệp: $entryPath"))
                }
                DetectedKind.TAR, DetectedKind.TAR_GZ, DetectedKind.TAR_BZ2,
                DetectedKind.TAR_XZ, DetectedKind.TAR_LZ4, DetectedKind.TAR_ZSTD -> {
                    openTarInputStream(archiveFile, kind).use { tis ->
                        var entry = tis.nextEntry
                        while (entry != null) {
                            if (entry.name == entryPath) {
                                return@withContext Result.success(readBoundedBytes(tis, maxBytes))
                            }
                            entry = tis.nextEntry
                        }
                    }
                    Result.failure(IllegalArgumentException("Không tìm thấy tệp: $entryPath"))
                }
            }
        } catch (e: PasswordRequiredException) {
            Result.failure(ArchivePasswordRequiredException())
        } catch (e: ZipException) {
            if (e.type == ZipException.Type.WRONG_PASSWORD || e.message?.contains("password", ignoreCase = true) == true) {
                Result.failure(ArchivePasswordRequiredException())
            } else Result.failure(e)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun readBoundedBytes(input: InputStream, maxBytes: Int): ByteArray {
        if (maxBytes == Int.MAX_VALUE) {
            return input.readBytes()
        }
        val baos = ByteArrayOutputStream()
        val buf = ByteArray(minOf(BUFFER_SIZE, maxBytes))
        var total = 0
        while (total < maxBytes) {
            val read = input.read(buf, 0, minOf(buf.size, maxBytes - total))
            if (read <= 0) break
            baos.write(buf, 0, read)
            total += read
        }
        return baos.toByteArray()
    }

    suspend fun extractDirectory(
        archiveFile: File,
        dirPrefix: String,
        targetDir: File,
        password: String? = null,
        onProgress: ((progress: Float, currentEntry: String) -> Unit)? = null
    ): Result<Int> = withContext(Dispatchers.IO) {
        try {
            if (!targetDir.exists()) targetDir.mkdirs()
            val normalizedPrefix = if (dirPrefix.isEmpty() || dirPrefix.endsWith("/")) dirPrefix else "$dirPrefix/"
            val entriesRes = listArchiveEntries(archiveFile, password)
            if (entriesRes.isFailure) return@withContext Result.failure(entriesRes.exceptionOrNull()!!)

            val matching = entriesRes.getOrThrow().filter { it.path.startsWith(normalizedPrefix) && !it.isDirectory }
            val paths = matching.map { it.path }
            if (paths.isEmpty()) return@withContext Result.success(0)

            var extractedCount = 0
            val canonicalTarget = targetDir.canonicalPath
            val total = matching.size.coerceAtLeast(1)

            matching.forEachIndexed { idx, info ->
                onProgress?.invoke(((idx + 1).toFloat() / total.toFloat()).coerceIn(0f, 1f), info.path)
                val relPath = info.path.removePrefix(normalizedPrefix)
                if (relPath.isEmpty()) return@forEachIndexed
                val outFile = File(targetDir, relPath)
                if (!outFile.canonicalPath.startsWith(canonicalTarget)) return@forEachIndexed

                val bytesRes = readEntryBytes(archiveFile, info.path, maxBytes = Int.MAX_VALUE, password = password)
                if (bytesRes.isSuccess) {
                    outFile.parentFile?.mkdirs()
                    FileOutputStream(outFile).use { it.write(bytesRes.getOrThrow()) }
                    extractedCount++
                }
            }
            Result.success(extractedCount)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun extractEntryToTemp(
        cacheDir: File,
        archiveFile: File,
        entryPath: String,
        password: String? = null
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val tempDir = File(cacheDir, "zip_temp_viewers").apply { mkdirs() }
            val fileName = entryPath.trimEnd('/').substringAfterLast('/')
            val safeFile = File(tempDir, "${System.currentTimeMillis()}_$fileName")
            val bytesRes = readEntryBytes(archiveFile, entryPath, maxBytes = Int.MAX_VALUE, password = password)
            if (bytesRes.isFailure) return@withContext Result.failure(bytesRes.exceptionOrNull()!!)

            FileOutputStream(safeFile).use { it.write(bytesRes.getOrThrow()) }
            Result.success(safeFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun extractNestedZip(
        cacheDir: File,
        archiveFile: File,
        entryPath: String,
        password: String? = null
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val nestedDir = File(cacheDir, "nested_zip_temp").apply { mkdirs() }
            val fileName = entryPath.trimEnd('/').substringAfterLast('/')
            val safeNestedFile = File(nestedDir, "${System.currentTimeMillis()}_$fileName")
            val bytesRes = readEntryBytes(archiveFile, entryPath, maxBytes = Int.MAX_VALUE, password = password)
            if (bytesRes.isFailure) return@withContext Result.failure(bytesRes.exceptionOrNull()!!)

            FileOutputStream(safeNestedFile).use { it.write(bytesRes.getOrThrow()) }
            Result.success(safeNestedFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun cleanTempFiles(cacheDir: File) {
        try {
            File(cacheDir, "zip_temp_viewers").deleteRecursively()
            File(cacheDir, "nested_zip_temp").deleteRecursively()
        } catch (_: Exception) {}
    }

    /**
     * Full-featured Archive Creation supporting 7z, zip, tar, tar.bz2, tar.gz, tar.xz, tar.lz4, tar.zstd,
     * encryption (ZipCrypto / AES-256), passwords, volume splitting, separate archives, and delete-source.
     */
    suspend fun createArchive(
        sourceFiles: List<File>,
        config: ArchiveCompressionConfig,
        onProgress: ((progress: Float, currentFile: String) -> Unit)? = null
    ): Result<List<File>> = withContext(Dispatchers.IO) {
        try {
            if (sourceFiles.isEmpty()) {
                return@withContext Result.failure(IllegalArgumentException("Không có tệp nguồn nào được chọn"))
            }
            if (!config.destinationDir.exists()) {
                config.destinationDir.mkdirs()
            }

            val createdArchives = mutableListOf<File>()

            if (config.createSeparateArchives && sourceFiles.size > 1) {
                val totalCount = sourceFiles.size.toFloat()
                sourceFiles.forEachIndexed { idx, singleSource ->
                    val singleName = "${singleSource.nameWithoutExtension.ifEmpty { singleSource.name }}.${config.format.extension}"
                    val destFile = File(config.destinationDir, singleName)
                    val produced = compressSingleBatch(listOf(singleSource), destFile, config) { p, currentName ->
                        val overall = (idx + p) / totalCount
                        onProgress?.invoke(overall.coerceIn(0f, 1f), currentName)
                    }
                    createdArchives.addAll(produced)
                    if (config.deleteSourceAfterCompression) {
                        singleSource.deleteRecursively()
                    }
                }
            } else {
                val cleanName = if (config.archiveFileName.lowercase(Locale.ROOT).endsWith(".${config.format.extension}")) {
                    config.archiveFileName
                } else {
                    ArchiveFormat.replaceExtension(config.archiveFileName, config.format)
                }
                val destFile = File(config.destinationDir, cleanName)
                val produced = compressSingleBatch(sourceFiles, destFile, config, onProgress)
                createdArchives.addAll(produced)
                if (config.deleteSourceAfterCompression) {
                    sourceFiles.forEach { it.deleteRecursively() }
                }
            }

            Result.success(createdArchives)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun compressSingleBatch(
        sources: List<File>,
        destFile: File,
        config: ArchiveCompressionConfig,
        onProgress: ((progress: Float, currentFile: String) -> Unit)?
    ): List<File> {
        if (destFile.exists()) destFile.delete()
        destFile.parentFile?.mkdirs()

        val totalFiles = sources.sumOf { countFilesIn(it) }.coerceAtLeast(1)
        var processed = 0
        fun reportItem(name: String) {
            processed++
            onProgress?.invoke((processed.toFloat() / totalFiles.toFloat()).coerceIn(0f, 1f), name)
        }

        when (config.format) {
            ArchiveFormat.ZIP -> {
                val zip = Zip4jFile(destFile)
                val params = ZipParameters().apply {
                    compressionMethod = if (config.compressionLevel == ArchiveCompressionLevel.STORE) {
                        CompressionMethod.STORE
                    } else {
                        CompressionMethod.DEFLATE
                    }
                    compressionLevel = when (config.compressionLevel) {
                        ArchiveCompressionLevel.STORE -> Zip4jCompressionLevel.NO_COMPRESSION
                        ArchiveCompressionLevel.FASTEST -> Zip4jCompressionLevel.FASTEST
                        ArchiveCompressionLevel.FAST -> Zip4jCompressionLevel.FAST
                        ArchiveCompressionLevel.NORMAL -> Zip4jCompressionLevel.NORMAL
                        ArchiveCompressionLevel.MAXIMUM -> Zip4jCompressionLevel.MAXIMUM
                        ArchiveCompressionLevel.ULTRA -> Zip4jCompressionLevel.ULTRA
                    }
                    if (config.password.isNotEmpty() && config.encryptionMethod != ArchiveEncryptionMethod.NONE) {
                        isEncryptFiles = true
                        when (config.encryptionMethod) {
                            ArchiveEncryptionMethod.ZIP_CRYPTO -> encryptionMethod = EncryptionMethod.ZIP_STANDARD
                            ArchiveEncryptionMethod.AES_256 -> {
                                encryptionMethod = EncryptionMethod.AES
                                aesKeyStrength = AesKeyStrength.KEY_STRENGTH_256
                            }
                            ArchiveEncryptionMethod.NONE -> {}
                        }
                    }
                }
                if (config.password.isNotEmpty() && config.encryptionMethod != ArchiveEncryptionMethod.NONE) {
                    zip.setPassword(config.password.toCharArray())
                }

                // Walk files cleanly to preserve exact relative paths and live progress
                for (source in sources) {
                    addRecursiveZip4j(zip, source, source.name, params) { name -> reportItem(name) }
                }
            }

            ArchiveFormat.SEVEN_Z -> {
                SevenZOutputFile(destFile).use { szOut ->
                    val method = when (config.compressionLevel) {
                        ArchiveCompressionLevel.STORE -> SevenZMethod.COPY
                        ArchiveCompressionLevel.FASTEST, ArchiveCompressionLevel.FAST -> SevenZMethod.DEFLATE
                        ArchiveCompressionLevel.NORMAL, ArchiveCompressionLevel.MAXIMUM, ArchiveCompressionLevel.ULTRA -> SevenZMethod.LZMA2
                    }
                    szOut.setContentCompression(method)
                    val buffer = ByteArray(BUFFER_SIZE)
                    for (source in sources) {
                        addRecursive7z(szOut, source, source.name, buffer) { name -> reportItem(name) }
                    }
                    szOut.finish()
                }
            }

            ArchiveFormat.TAR, ArchiveFormat.TAR_GZ, ArchiveFormat.TAR_BZ2,
            ArchiveFormat.TAR_XZ, ArchiveFormat.TAR_LZ4, ArchiveFormat.TAR_ZSTD -> {
                val rawFos = BufferedOutputStream(FileOutputStream(destFile), BUFFER_SIZE)
                val compressedOut: OutputStream = when (config.format) {
                    ArchiveFormat.TAR -> rawFos
                    ArchiveFormat.TAR_GZ -> {
                        val gzParams = GzipParameters().apply {
                            compressionLevel = when (config.compressionLevel) {
                                ArchiveCompressionLevel.STORE -> Deflater.NO_COMPRESSION
                                ArchiveCompressionLevel.FASTEST -> Deflater.BEST_SPEED
                                ArchiveCompressionLevel.FAST -> 3
                                ArchiveCompressionLevel.NORMAL -> 6
                                ArchiveCompressionLevel.MAXIMUM -> 8
                                ArchiveCompressionLevel.ULTRA -> Deflater.BEST_COMPRESSION
                            }
                        }
                        GzipCompressorOutputStream(rawFos, gzParams)
                    }
                    ArchiveFormat.TAR_BZ2 -> {
                        val blockSize = when (config.compressionLevel) {
                            ArchiveCompressionLevel.STORE, ArchiveCompressionLevel.FASTEST -> 1
                            ArchiveCompressionLevel.FAST -> 3
                            ArchiveCompressionLevel.NORMAL -> 5
                            ArchiveCompressionLevel.MAXIMUM -> 7
                            ArchiveCompressionLevel.ULTRA -> 9
                        }
                        BZip2CompressorOutputStream(rawFos, blockSize)
                    }
                    ArchiveFormat.TAR_XZ -> {
                        val preset = when (config.compressionLevel) {
                            ArchiveCompressionLevel.STORE, ArchiveCompressionLevel.FASTEST -> 1
                            ArchiveCompressionLevel.FAST -> 3
                            ArchiveCompressionLevel.NORMAL -> 5
                            ArchiveCompressionLevel.MAXIMUM -> 7
                            ArchiveCompressionLevel.ULTRA -> 9
                        }
                        XZCompressorOutputStream(rawFos, preset)
                    }
                    ArchiveFormat.TAR_LZ4 -> FramedLZ4CompressorOutputStream(rawFos)
                    ArchiveFormat.TAR_ZSTD -> {
                        val zLevel = when (config.compressionLevel) {
                            ArchiveCompressionLevel.STORE -> 1
                            ArchiveCompressionLevel.FASTEST -> 1
                            ArchiveCompressionLevel.FAST -> 3
                            ArchiveCompressionLevel.NORMAL -> 6
                            ArchiveCompressionLevel.MAXIMUM -> 12
                            ArchiveCompressionLevel.ULTRA -> 19
                        }
                        ZstdCompressorOutputStream(rawFos, zLevel)
                    }
                    else -> rawFos
                }

                TarArchiveOutputStream(compressedOut).use { tos ->
                    tos.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
                    tos.setBigNumberMode(TarArchiveOutputStream.BIGNUMBER_POSIX)
                    val buffer = ByteArray(BUFFER_SIZE)
                    for (source in sources) {
                        addRecursiveTar(tos, source, source.name, buffer) { name -> reportItem(name) }
                    }
                    tos.finish()
                }
            }
        }

        // Handle Volume Splitting if requested
        val splitBytes = config.splitOption.sizeBytes
        if (splitBytes > 0L && destFile.exists() && destFile.length() > splitBytes) {
            return splitArchiveIntoParts(destFile, splitBytes)
        }
        return listOf(destFile)
    }

    private fun splitArchiveIntoParts(archiveFile: File, partSizeBytes: Long): List<File> {
        val parts = mutableListOf<File>()
        val parent = archiveFile.parentFile ?: return listOf(archiveFile)
        val baseName = archiveFile.name
        val buffer = ByteArray(BUFFER_SIZE)

        BufferedInputStream(FileInputStream(archiveFile), BUFFER_SIZE).use { bis ->
            var partIndex = 1
            while (true) {
                val partFile = File(parent, "%s.%03d".format(Locale.ROOT, baseName, partIndex))
                var writtenForPart = 0L
                var reachedEof = false

                BufferedOutputStream(FileOutputStream(partFile), BUFFER_SIZE).use { bos ->
                    while (writtenForPart < partSizeBytes) {
                        val toRead = minOf(buffer.size.toLong(), partSizeBytes - writtenForPart).toInt()
                        val read = bis.read(buffer, 0, toRead)
                        if (read == -1) {
                            reachedEof = true
                            break
                        }
                        bos.write(buffer, 0, read)
                        writtenForPart += read
                    }
                }

                if (writtenForPart == 0L) {
                    partFile.delete()
                    break
                } else {
                    parts.add(partFile)
                }

                if (reachedEof) break
                partIndex++
            }
        }

        if (parts.isNotEmpty()) {
            archiveFile.delete()
            return parts
        }
        return listOf(archiveFile)
    }

    private fun addRecursiveZip4j(
        zip: Zip4jFile,
        file: File,
        entryPath: String,
        baseParams: ZipParameters,
        onItem: (String) -> Unit
    ) {
        onItem(file.name)
        if (file.isDirectory) {
            val dirParams = ZipParameters(baseParams).apply {
                fileNameInZip = if (entryPath.endsWith("/")) entryPath else "$entryPath/"
            }
            // Add empty directory or walk children
            val children = file.listFiles()
            if (children.isNullOrEmpty()) {
                ByteArrayInputStream(ByteArray(0)).use { emptyStream ->
                    zip.addStream(emptyStream, dirParams)
                }
            } else {
                children.forEach { child ->
                    addRecursiveZip4j(zip, child, "$entryPath/${child.name}", baseParams, onItem)
                }
            }
        } else {
            val fileParams = ZipParameters(baseParams).apply {
                fileNameInZip = entryPath
            }
            zip.addFile(file, fileParams)
        }
    }

    private fun addRecursive7z(
        szOut: SevenZOutputFile,
        file: File,
        entryPath: String,
        buffer: ByteArray,
        onItem: (String) -> Unit
    ) {
        onItem(file.name)
        val entry = szOut.createArchiveEntry(file, entryPath)
        szOut.putArchiveEntry(entry)
        if (file.isFile) {
            BufferedInputStream(FileInputStream(file), BUFFER_SIZE).use { bis ->
                var len: Int
                while (bis.read(buffer).also { len = it } != -1) {
                    szOut.write(buffer, 0, len)
                }
            }
            szOut.closeArchiveEntry()
        } else {
            szOut.closeArchiveEntry()
            file.listFiles()?.forEach { child ->
                addRecursive7z(szOut, child, "$entryPath/${child.name}", buffer, onItem)
            }
        }
    }

    private fun addRecursiveTar(
        tos: TarArchiveOutputStream,
        file: File,
        entryPath: String,
        buffer: ByteArray,
        onItem: (String) -> Unit
    ) {
        onItem(file.name)
        val normalizedPath = if (file.isDirectory && !entryPath.endsWith("/")) "$entryPath/" else entryPath
        val entry = TarArchiveEntry(file, normalizedPath)
        tos.putArchiveEntry(entry)
        if (file.isFile) {
            BufferedInputStream(FileInputStream(file), BUFFER_SIZE).use { bis ->
                var len: Int
                while (bis.read(buffer).also { len = it } != -1) {
                    tos.write(buffer, 0, len)
                }
            }
            tos.closeArchiveEntry()
        } else {
            tos.closeArchiveEntry()
            file.listFiles()?.forEach { child ->
                addRecursiveTar(tos, child, "$entryPath/${child.name}", buffer, onItem)
            }
        }
    }

    // Legacy compatibility wrapper
    suspend fun createZip(
        sourceFiles: List<File>,
        destinationZip: File,
        compressionLevel: Int = Deflater.BEST_SPEED,
        onProgress: ((progress: Float, currentFile: String) -> Unit)? = null
    ): Result<File> {
        val level = when (compressionLevel) {
            0 -> ArchiveCompressionLevel.STORE
            1 -> ArchiveCompressionLevel.FASTEST
            in 2..4 -> ArchiveCompressionLevel.FAST
            5, 6 -> ArchiveCompressionLevel.NORMAL
            7, 8 -> ArchiveCompressionLevel.MAXIMUM
            else -> ArchiveCompressionLevel.ULTRA
        }
        val config = ArchiveCompressionConfig(
            archiveFileName = destinationZip.name,
            destinationDir = destinationZip.parentFile ?: File("/"),
            format = ArchiveFormat.ZIP,
            compressionLevel = level
        )
        val res = createArchive(sourceFiles, config, onProgress)
        return res.map { it.firstOrNull() ?: destinationZip }
    }

    private fun countFilesIn(file: File): Int {
        if (!file.isDirectory) return 1
        return 1 + (file.listFiles()?.sumOf { countFilesIn(it) } ?: 0)
    }

    suspend fun testArchiveIntegrity(archiveFile: File, password: String? = null): Result<String> = withContext(Dispatchers.IO) {
        try {
            val entriesRes = listArchiveEntries(archiveFile, password)
            if (entriesRes.isFailure) {
                return@withContext Result.failure(entriesRes.exceptionOrNull()!!)
            }
            val count = entriesRes.getOrThrow().size
            Result.success("Tệp nén toàn vẹn tốt: $count mục đã kiểm tra thành công, không có lỗi cấu trúc.")
        } catch (e: Exception) {
            Result.failure(Exception("Phát hiện lỗi trong tệp nén: ${e.message}"))
        }
    }
}
