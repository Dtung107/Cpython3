package com.example.filemanager.utils

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.MediaMetadataRetriever
import android.os.Build
import android.util.LruCache
import com.example.filemanager.archive.ArchiveManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipFile

/**
 * High-performance asynchronous thumbnail loader with LRU cache for:
 * - Standalone APK files
 * - Videos
 * - Archives containing APK files (e.g. .zip, .xapk, .apks)
 * - Individual .apk and image entries inside archives
 */
object FileThumbnailLoader {

    // 24 MB memory cache for crisp thumbnails
    private val bitmapCache: LruCache<String, Bitmap> = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    // Track keys known to have no extractable APK/thumbnail so scroll never retries endlessly
    private val emptyResultKeys = ConcurrentHashMap.newKeySet<String>()

    // Limit concurrent heavy I/O extractions to keep UI silky smooth
    private val extractionSemaphore = Semaphore(3)

    private fun drawableToScaledBitmap(drawable: Drawable, maxSize: Int = 128): Bitmap {
        if (drawable is BitmapDrawable && drawable.bitmap != null) {
            val bmp = drawable.bitmap
            if (bmp.width <= maxSize && bmp.height <= maxSize) return bmp
            return Bitmap.createScaledBitmap(bmp, maxSize, maxSize, true)
        }
        val w = drawable.intrinsicWidth.takeIf { it > 0 } ?: maxSize
        val h = drawable.intrinsicHeight.takeIf { it > 0 } ?: maxSize
        val targetW = minOf(w, maxSize)
        val targetH = minOf(h, maxSize)
        val bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    private fun loadApkIconSync(context: Context, apkFile: File): Bitmap? {
        return try {
            if (!apkFile.exists() || !apkFile.canRead() || apkFile.length() == 0L) return null
            val pm = context.packageManager
            val pkgInfo = pm.getPackageArchiveInfo(apkFile.absolutePath, 0) ?: return null
            val appInfo = pkgInfo.applicationInfo ?: return null
            appInfo.sourceDir = apkFile.absolutePath
            appInfo.publicSourceDir = apkFile.absolutePath
            val drawable = appInfo.loadIcon(pm) ?: return null
            drawableToScaledBitmap(drawable, 128)
        } catch (_: Exception) {
            null
        }
    }

    suspend fun loadApkIconBitmap(context: Context, apkFile: File): Bitmap? {
        val key = "apk:${apkFile.absolutePath}:${apkFile.lastModified()}"
        bitmapCache.get(key)?.let { return it }
        if (emptyResultKeys.contains(key)) return null

        return withContext(Dispatchers.IO) {
            extractionSemaphore.withPermit {
                bitmapCache.get(key)?.let { return@withContext it }
                val bmp = loadApkIconSync(context, apkFile)
                if (bmp != null) {
                    bitmapCache.put(key, bmp)
                } else {
                    emptyResultKeys.add(key)
                }
                bmp
            }
        }
    }

    suspend fun loadVideoThumbnail(videoFile: File): Bitmap? {
        val key = "vid:${videoFile.absolutePath}:${videoFile.lastModified()}"
        bitmapCache.get(key)?.let { return it }
        if (emptyResultKeys.contains(key)) return null

        return withContext(Dispatchers.IO) {
            extractionSemaphore.withPermit {
                bitmapCache.get(key)?.let { return@withContext it }
                val bmp = try {
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(videoFile.absolutePath)
                        val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                            retriever.getScaledFrameAtTime(
                                1_000_000L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                                160,
                                160
                            ) ?: retriever.getScaledFrameAtTime(
                                0L,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                                160,
                                160
                            )
                        } else {
                            retriever.frameAtTime?.let {
                                val ratio = minOf(160f / it.width, 160f / it.height).coerceAtMost(1f)
                                Bitmap.createScaledBitmap(
                                    it,
                                    (it.width * ratio).toInt().coerceAtLeast(1),
                                    (it.height * ratio).toInt().coerceAtLeast(1),
                                    true
                                )
                            }
                        }
                        raw
                    } finally {
                        try { retriever.release() } catch (_: Exception) {}
                    }
                } catch (_: Exception) {
                    null
                }
                if (bmp != null) bitmapCache.put(key, bmp) else emptyResultKeys.add(key)
                bmp
            }
        }
    }

    /**
     * Checks an archive file (.zip, .xapk, .apks, .apkm) for an APK icon or APK entry icon.
     * Returns the extracted app icon Bitmap if the archive contains an APK, else null.
     */
    suspend fun loadArchiveApkThumbnail(context: Context, archiveFile: File): Bitmap? {
        val ext = archiveFile.extension.lowercase()
        if (ext !in setOf("zip", "xapk", "apks", "apkm")) return null
        val key = "arc_apk:${archiveFile.absolutePath}:${archiveFile.lastModified()}:${archiveFile.length()}"
        bitmapCache.get(key)?.let { return it }
        if (emptyResultKeys.contains(key)) return null

        return withContext(Dispatchers.IO) {
            extractionSemaphore.withPermit {
                bitmapCache.get(key)?.let { return@withContext it }
                var resultBitmap: Bitmap? = null
                try {
                    ZipFile(archiveFile).use { zip ->
                        // Fast path: XAPK/APKM bundles often include icon.png at archive root
                        val iconEntry = zip.getEntry("icon.png") ?: zip.getEntry("icon.webp")
                        if (iconEntry != null && iconEntry.size in 1L..(2 * 1024 * 1024L)) {
                            val bytes = zip.getInputStream(iconEntry).use { it.readBytes() }
                            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                            opts.inSampleSize = calculateInSampleSize(opts, 128, 128)
                            opts.inJustDecodeBounds = false
                            resultBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                        }

                        // Standard path: find base.apk or first *.apk inside archive
                        if (resultBitmap == null) {
                            val entries = zip.entries()
                            var candidateApkEntry: java.util.zip.ZipEntry? = null
                            while (entries.hasMoreElements()) {
                                val entry = entries.nextElement()
                                if (!entry.isDirectory && entry.name.endsWith(".apk", ignoreCase = true)) {
                                    if (entry.name.endsWith("base.apk", ignoreCase = true)) {
                                        candidateApkEntry = entry
                                        break
                                    }
                                    if (candidateApkEntry == null) {
                                        candidateApkEntry = entry
                                    }
                                }
                            }

                            if (candidateApkEntry != null && candidateApkEntry.size in 1L..(180L * 1024L * 1024L)) {
                                val tmpDir = File(context.cacheDir, "apk_thumb_tmp").apply { mkdirs() }
                                val tmpApk = File(tmpDir, "thumb_${System.nanoTime()}.apk")
                                try {
                                    zip.getInputStream(candidateApkEntry).use { input ->
                                        BufferedOutputStream(FileOutputStream(tmpApk), 64 * 1024).use { output ->
                                            input.copyTo(output, 64 * 1024)
                                        }
                                    }
                                    resultBitmap = loadApkIconSync(context, tmpApk)
                                } finally {
                                    tmpApk.delete()
                                }
                            }
                        }
                    }
                } catch (_: Exception) {
                }

                if (resultBitmap != null) {
                    bitmapCache.put(key, resultBitmap!!)
                } else {
                    emptyResultKeys.add(key)
                }
                resultBitmap
            }
        }
    }

    /**
     * Loads the actual app icon thumbnail for a specific .apk entry inside an archive.
     */
    suspend fun loadArchiveEntryApkThumbnail(
        context: Context,
        archiveFile: File,
        entryPath: String,
        password: String? = null
    ): Bitmap? {
        val key = "entry_apk:${archiveFile.absolutePath}:$entryPath:${archiveFile.lastModified()}"
        bitmapCache.get(key)?.let { return it }
        if (emptyResultKeys.contains(key)) return null

        return withContext(Dispatchers.IO) {
            extractionSemaphore.withPermit {
                bitmapCache.get(key)?.let { return@withContext it }
                val tmpDir = File(context.cacheDir, "apk_entry_thumb_tmp").apply { mkdirs() }
                var tmpFile: File? = null
                val bmp = try {
                    val res = ArchiveManager.extractEntryToTemp(tmpDir, archiveFile, entryPath, password)
                    if (res.isSuccess) {
                        tmpFile = res.getOrThrow()
                        loadApkIconSync(context, tmpFile!!)
                    } else null
                } catch (_: Exception) {
                    null
                } finally {
                    tmpFile?.delete()
                }
                if (bmp != null) bitmapCache.put(key, bmp) else emptyResultKeys.add(key)
                bmp
            }
        }
    }

    /**
     * Loads a scaled image thumbnail for an image entry inside an archive.
     */
    suspend fun loadArchiveEntryImageThumbnail(
        archiveFile: File,
        entryPath: String,
        password: String? = null,
        maxSizePx: Int = 128
    ): Bitmap? {
        val key = "entry_img:${archiveFile.absolutePath}:$entryPath:${archiveFile.lastModified()}"
        bitmapCache.get(key)?.let { return it }
        if (emptyResultKeys.contains(key)) return null

        return withContext(Dispatchers.IO) {
            extractionSemaphore.withPermit {
                bitmapCache.get(key)?.let { return@withContext it }
                val bmp = try {
                    val res = ArchiveManager.readEntryBytes(
                        archiveFile = archiveFile,
                        entryPath = entryPath,
                        maxBytes = 8 * 1024 * 1024,
                        password = password
                    )
                    if (res.isSuccess) {
                        val bytes = res.getOrThrow()
                        if (bytes.isNotEmpty()) {
                            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                            opts.inSampleSize = calculateInSampleSize(opts, maxSizePx, maxSizePx)
                            opts.inJustDecodeBounds = false
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                        } else null
                    } else null
                } catch (_: Exception) {
                    null
                }
                if (bmp != null) bitmapCache.put(key, bmp) else emptyResultKeys.add(key)
                bmp
            }
        }
    }

    private fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
        val height = options.outHeight
        val width = options.outWidth
        var inSampleSize = 1
        if (height > reqHeight || width > reqWidth) {
            val halfHeight = height / 2
            val halfWidth = width / 2
            while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }
}
