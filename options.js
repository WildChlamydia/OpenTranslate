// Helpers to store and access objects in local storage.
Storage.prototype.setObject = function(key, value) {
  this.setItem(key, JSON.stringify(value));
}
Storage.prototype.getObject = function(key) {
  var value = this.getItem(key);
  if (value == null) {
    return null;
  } else {
    return JSON.parse(value);
  }
}

function showMessage(msg) {
  var status = document.getElementById('saveStatusMessage');
  status.innerHTML = msg;
  status.style.opacity = 1;
  setTimeout(function() {
    status.style.opacity = 0;
  }, 2500);
}

// Set the active option in the <select> named select_name to choice.
function setSelection(select_name, choice) {
  var select = document.getElementById(select_name);
  for (var i in select.children) {
    var child = select.children[i];
    if (child.value == choice) {
      child.selected = 'true';
      break;
    }
  }
}

selects    = ['clickModifier', 'shortcutModifier', 'shortcutKey'];
checkboxes = ['shortcutEnable', 'shortcutSelection', 'hideWithEscape',
              'saveFrameSize', 'showIPA', 'showAudio', 'showAudioLinks',
              'yandexEnable', 'mymemoryEnable', 'mymemoryUserTransEnable',
              'frenqlyEnable'];
numboxes  = ['frameWidth', 'frameHeight', 'queryFormWidth'];
textboxes = ['yandexApiKey', 'frenqlyLogin', 'frenqlyPass'];

// Restores state from localStorage.
function restoreOptions() {
  // Set defaults.
  setSelection('clickModifier', 'None');
  setSelection('shortcutModifier', 'Ctrl');
  setSelection('shortcutKey', 'B');
  document.getElementById('shortcutEnable').checked = true;
  document.getElementById('shortcutSelection').checked = false;

  // Checkboxes for search translate services
  document.getElementById('yandexEnable').checked = false;
  document.getElementById('mymemoryEnable').checked = true;
  document.getElementById('mymemoryUserTransEnable').checked = true;
  document.getElementById('frenqlyEnable').checked = false;
  document.getElementById('yandexApiKey').value = '';
  document.getElementById('frenqlyLogin').value = '';
  document.getElementById('frenqlyPass').value = '';

  document.getElementById('frameWidth').value = 550;
  document.getElementById('frameHeight').value = 250;
  document.getElementById('queryFormWidth').value = 250;
  document.getElementById('hideWithEscape').checked = true;
  document.getElementById('saveFrameSize').checked = true;
  document.getElementById('showIPA').checked = true;
  document.getElementById('showAudio').checked = true;
  document.getElementById('showAudioLinks').checked = true;

  // Override defaults by saved settings.
  for (var i in selects) {
    var select = selects[i];
    var choice = localStorage.getObject(select);
    if (choice != null) setSelection(select, choice);
  }
  
  for (var i in checkboxes) {
    var checkbox = checkboxes[i];
    var checked = localStorage.getObject(checkbox);
    if (checked != null) document.getElementById(checkbox).checked = checked;
  }

  for (var i in textboxes) {
    var textbox = textboxes[i];
    var val = localStorage.getObject(textbox);
    if (checked != null) document.getElementById(textbox).value = val;
  }
  
  for (var i in numboxes) {
    var numbox = numboxes[i];
    var val = localStorage.getObject(numbox);
    if (val != null) document.getElementById(numbox).value = Math.round(val);
  }
  
  updateFields();
}

// Saves state to localStorage.
function saveOptions() {
  if (document.getElementById('yandexEnable').checked && !document.getElementById('yandexApiKey').value) {
    showMessage('Введите API ключ для Яндекс.Перевод');
    return;
  }
  if (document.getElementById('frenqlyEnable').checked && !document.getElementById('frenqlyLogin').value) {
    showMessage('Введите логин для Frengly');
    return;
  }
  if (document.getElementById('frenqlyEnable').checked && !document.getElementById('frenqlyPass').value) {
    showMessage('Введите пароль для Frengly');
    return;
  }

  for (var i in selects) {
    var select = selects[i];
    localStorage.setObject(select, document.getElementById(select).value);
  }

  for (var i in checkboxes) {
    var checkbox = checkboxes[i];
    localStorage.setObject(checkbox, document.getElementById(checkbox).checked);
  }

  for (var i in numboxes) {
    var numbox = numboxes[i];
    var value = parseInt(document.getElementById(numbox).value);
    if (value) localStorage.setObject(numbox, value);
  }

  for (var i in textboxes) {
    var textbox = textboxes[i];
    localStorage.setObject(textbox, document.getElementById(textbox).value);
  }
  
  // Fade in status message.
  showMessage('Настройки сохранены');
}

function updateFields() {
  checked = document.getElementById('shortcutEnable').checked;
  document.getElementById('shortcutModifier').disabled = !checked;
  document.getElementById('shortcutKey').disabled = !checked;
  document.getElementById('shortcutSelection').disabled = !checked;

  checked = document.getElementById('yandexEnable').checked;
  document.getElementById('yandexApiKey').disabled = !checked;

  checked = document.getElementById('frenqlyEnable').checked;
  document.getElementById('frenqlyLogin').disabled = !checked;
  document.getElementById('frenqlyPass').disabled = !checked;

  checked = document.getElementById('mymemoryEnable').checked;
  document.getElementById('mymemoryUserTransEnable').disabled = !checked;
}

// Event binding
window.addEventListener('load', function() {
  restoreOptions();
  document.getElementById('shortcutEnable').addEventListener('click', updateFields);
  document.getElementById('mymemoryEnable').addEventListener('click', updateFields);
  document.getElementById('frenqlyEnable').addEventListener('click', updateFields);
  document.getElementById('yandexEnable').addEventListener('click', updateFields);
  document.getElementById('saveOptions').addEventListener('click', saveOptions);
});

