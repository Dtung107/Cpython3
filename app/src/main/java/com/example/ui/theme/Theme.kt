package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val FileManagerDarkColorScheme = darkColorScheme(
    primary = ElectricBlue,
    onPrimary = Color.White,
    primaryContainer = ElectricBlueVariant,
    onPrimaryContainer = Color.White,
    secondary = CyanAccent,
    onSecondary = Color.Black,
    secondaryContainer = CharcoalSurfaceVariant,
    onSecondaryContainer = TextPrimary,
    tertiary = ColorPurpleBadge,
    onTertiary = Color.White,
    background = CharcoalBackground,
    onBackground = TextPrimary,
    surface = CharcoalSurface,
    onSurface = TextPrimary,
    surfaceVariant = CharcoalSurfaceVariant,
    onSurfaceVariant = TextSecondary,
    outline = CharcoalSurfaceHighlight,
    outlineVariant = DocumentsUIDivider,
    error = ErrorRed,
    onError = Color.White
)

@Composable
fun FileManagerProTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = FileManagerDarkColorScheme,
        typography = Typography,
        content = content
    )
}
