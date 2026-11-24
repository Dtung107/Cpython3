package com.example

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.example.filemanager.viewmodel.MainViewModel
import com.example.ui.theme.FileManagerProTheme

/**
 * Independent secondary window Activity with its own taskAffinity and documentLaunchMode="always"
 * so users can run 2+ completely independent File Manager Pro windows side-by-side or in Recents.
 */
class SecondaryWindowActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        if (savedInstanceState == null) {
            handleWindowIntent(intent)
        }

        setContent {
            FileManagerProTheme {
                MainAppContainer(viewModel = viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleWindowIntent(intent)
    }

    private fun handleWindowIntent(intent: Intent?) {
        val startInFiles = intent?.getBooleanExtra(EXTRA_START_IN_FILES, true) ?: true
        val initialPath = intent?.getStringExtra(EXTRA_INITIAL_PATH)
        viewModel.initFromWindowIntent(startInFiles = startInFiles, initialPath = initialPath)
    }

    companion object {
        const val EXTRA_START_IN_FILES = "extra_start_in_files"
        const val EXTRA_INITIAL_PATH = "extra_initial_path"
    }
}
