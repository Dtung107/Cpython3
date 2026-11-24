package com.example.filemanager.archive

import java.io.File

enum class ArchiveFormat(
    val extension: String,
    val displayName: String,
    val supportsEncryption: Boolean
) {
    SEVEN_Z("7z", "7z", false),
    ZIP("zip", "zip", true),
    TAR("tar", "tar", false),
    TAR_BZ2("tar.bz2", "tar.bz2", false),
    TAR_GZ("tar.gz", "tar.gz", false),
    TAR_XZ("tar.xz", "tar.xz", false),
    TAR_LZ4("tar.lz4", "tar.lz4", false),
    TAR_ZSTD("tar.zstd", "tar.zstd", false);

    companion object {
        fun replaceExtension(currentName: String, newFormat: ArchiveFormat): String {
            val trimmed = currentName.trim().ifEmpty { "archive" }
            val knownExts = listOf(
                ".tar.bz2", ".tar.gz", ".tar.xz", ".tar.lz4", ".tar.zstd", ".tar.zst",
                ".7z", ".zip", ".tar", ".tgz", ".tbz2", ".txz"
            )
            val lower = trimmed.lowercase()
            var base = trimmed
            for (ext in knownExts) {
                if (lower.endsWith(ext)) {
                    base = trimmed.substring(0, trimmed.length - ext.length)
                    break
                }
            }
            if (base == trimmed && trimmed.contains('.')) {
                base = trimmed.substringBeforeLast('.')
            }
            if (base.isBlank()) base = "archive"
            return "$base.${newFormat.extension}"
        }
    }
}

enum class ArchiveCompressionLevel(
    val displayName: String,
    val levelValue: Int
) {
    STORE("Không nén", 0),
    FASTEST("Nhanh nhất", 1),
    FAST("Nhanh", 3),
    NORMAL("Bình thường", 5),
    MAXIMUM("Tối đa", 7),
    ULTRA("Siêu nén", 9)
}

enum class ArchiveEncryptionMethod(
    val displayName: String
) {
    NONE("Không mã hóa"),
    ZIP_CRYPTO("Dữ liệu (ZipCrypto)"),
    AES_256("AES-256")
}

enum class ArchiveSplitOption(
    val displayName: String,
    val sizeBytes: Long
) {
    NONE("Không", 0L),
    MB_10("10 MB", 10L * 1024L * 1024L),
    MB_50("50 MB", 50L * 1024L * 1024L),
    MB_100("100 MB", 100L * 1024L * 1024L),
    MB_500("500 MB", 500L * 1024L * 1024L),
    CD_700("700 MB (CD)", 700L * 1024L * 1024L),
    GB_1("1 GB", 1024L * 1024L * 1024L),
    GB_2("2 GB", 2L * 1024L * 1024L * 1024L),
    GB_4("4 GB (FAT32)", 4L * 1024L * 1024L * 1024L)
}

data class ArchiveCompressionConfig(
    val archiveFileName: String,
    val destinationDir: File,
    val format: ArchiveFormat = ArchiveFormat.ZIP,
    val compressionLevel: ArchiveCompressionLevel = ArchiveCompressionLevel.FAST,
    val encryptionMethod: ArchiveEncryptionMethod = ArchiveEncryptionMethod.NONE,
    val password: String = "",
    val splitOption: ArchiveSplitOption = ArchiveSplitOption.NONE,
    val deleteSourceAfterCompression: Boolean = false,
    val createSeparateArchives: Boolean = false
)

class ArchivePasswordRequiredException(message: String = "Tệp lưu trữ được bảo vệ bằng mật khẩu") : Exception(message)
