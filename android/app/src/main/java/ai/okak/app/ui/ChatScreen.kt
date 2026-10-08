package ai.okak.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

private val SUGGESTIONS = listOf(
    "Который час?",
    "Сколько дней до Нового года?",
    "15% от 480",
    "Корень из 144",
    "Столица Франции",
    "Расскажи анекдот",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(viewModel: ChatViewModel = viewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    var input by remember { mutableStateOf("") }
    var showSettings by remember { mutableStateOf(false) }

    LaunchedEffect(state.messages.size, state.busy) {
        if (state.messages.isNotEmpty()) {
            val last = state.messages.size - 1 + if (state.busy) 1 else 0
            listState.animateScrollToItem(last)
        }
    }

    Scaffold(
        containerColor = Color.Black,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Black,
                    titleContentColor = Color.White,
                    actionIconContentColor = Color.White,
                ),
                title = {
                    Column {
                        Text(
                            "OKAK",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp,
                        )
                        Text(
                            if (state.aiEnabled) "Gemini · ключ ${state.keyMask.orEmpty()}"
                            else "Локальный режим · ключ не задан",
                            fontSize = 12.sp,
                            color = if (state.aiEnabled) MaterialTheme.colorScheme.secondary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::clearChat) {
                        Icon(Icons.Filled.Delete, contentDescription = "Очистить чат")
                    }
                    IconButton(onClick = { showSettings = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Настройки")
                    }
                },
            )
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black)
                    .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
                    .padding(bottom = 8.dp),
            ) {
                Suggestions(
                    enabled = !state.busy,
                    onPick = { viewModel.send(it) },
                )
                InputBar(
                    value = input,
                    enabled = !state.busy,
                    onValueChange = { input = it },
                    onSend = {
                        val text = input
                        input = ""
                        viewModel.send(text)
                    },
                )
            }
        },
    ) { innerPadding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (state.messages.isEmpty()) {
                item(key = "welcome") { WelcomeCard() }
            }
            items(state.messages, key = { it.id }) { message ->
                MessageBubble(message)
            }
            if (state.busy) {
                item(key = "typing") { TypingBubble() }
            }
        }
    }

    if (showSettings) {
        SettingsDialog(
            hasKey = state.aiEnabled,
            maskedKey = state.keyMask,
            storeError = state.storeError,
            onSave = { key ->
                val error = viewModel.saveApiKey(key)
                if (error == null) showSettings = false
                error
            },
            onRemove = {
                viewModel.removeApiKey()
                showSettings = false
            },
            onDismiss = { showSettings = false },
        )
    }
}

@Composable
private fun WelcomeCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("👋", fontSize = 36.sp)
            Spacer(Modifier.height(8.dp))
            Text(
                "Привет! Я OKAK. Знаю время и дату, считаю математику, рассказываю о науке, истории и географии. " +
                    "С ключом Gemini отвечаю и на любые другие вопросы.",
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                lineHeight = 21.sp,
            )
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val isUser = message.fromUser
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier.widthIn(max = 320.dp),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
        ) {
            Surface(
                shape = RoundedCornerShape(
                    topStart = 20.dp,
                    topEnd = 20.dp,
                    bottomStart = if (isUser) 20.dp else 6.dp,
                    bottomEnd = if (isUser) 6.dp else 20.dp,
                ),
                color = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
            ) {
                Text(
                    text = message.text,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                )
            }
            if (message.meta.isNotEmpty()) {
                Text(
                    message.meta,
                    modifier = Modifier.padding(start = 6.dp, top = 2.dp),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun TypingBubble() {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        Surface(
            shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 6.dp, bottomEnd = 20.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
                Text("Думаю…", fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun Suggestions(enabled: Boolean, onPick: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SUGGESTIONS.forEach { text ->
            AssistChip(
                onClick = { if (enabled) onPick(text) },
                label = { Text(text) },
                enabled = enabled,
            )
        }
    }
}

@Composable
private fun InputBar(
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val canSend = enabled && value.isNotBlank()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Спросите что-нибудь…") },
            shape = RoundedCornerShape(24.dp),
            maxLines = 4,
            enabled = enabled,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
        )
        Spacer(Modifier.size(8.dp))
        IconButton(
            onClick = { if (canSend) onSend() },
            enabled = canSend,
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(if (canSend) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = "Отправить",
                tint = if (canSend) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SettingsDialog(
    hasKey: Boolean,
    maskedKey: String?,
    storeError: String?,
    onSave: (String) -> String?,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    var key by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF111111),
        titleContentColor = Color.White,
        textContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        title = { Text("Настройки", fontWeight = FontWeight.Bold) },
        text = {
            Column {
                Text(
                    if (hasKey) "Ключ Gemini сохранён: $maskedKey" else "Ключ Gemini не задан — работает локальный режим.",
                    fontSize = 13.sp,
                    color = if (hasKey) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "Бесплатный ключ берётся в Google AI Studio. Он хранится зашифрованно на устройстве и " +
                        "передаётся только Google Gemini.",
                    fontSize = 12.sp,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = key,
                    onValueChange = {
                        key = it
                        error = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Новый ключ Gemini") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                )
                val message = error ?: storeError
                if (message != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { error = onSave(key) },
                enabled = key.isNotBlank(),
            ) { Text("Сохранить") }
        },
        dismissButton = {
            Row {
                if (hasKey) {
                    OutlinedButton(onClick = onRemove) { Text("Удалить") }
                    Spacer(Modifier.size(8.dp))
                }
                TextButton(onClick = onDismiss) { Text("Закрыть") }
            }
        },
    )
}
