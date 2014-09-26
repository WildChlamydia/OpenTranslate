// API URLs.
var DICT_API_URL = 'http://dictionary-lookup.org/%query%';
var AUDIO_API_URL = 'http://commons.wikimedia.org/w/api.php?action=query&titles=File:%file%&prop=imageinfo&iiprop=url&format=json';
var AUDIO_LINK_TEMPLATE = 'http://en.wiktionary.org/wiki/File:%file%';

// URL for translate
var MYMEMORY_GET_LINK_TEMPLATE = 'http://api.mymemory.translated.net/get?q=%query%&langpair=en|ru';
var MYMEMORY_SET_LINK_TEMPLATE = 'http://api.mymemory.translated.net/set?seg=%query%&tra=%trans%&langpair=en|ru';
var YANDEX_GET_LINK_TEMPLATE = 'https://translate.yandex.net/api/v1.5/tr.json/translate?key=%key%&text=%query%&lang=ru';
var FRENQLY_GET_LINK_TEMPLATE = 'http://syslang.com/?src=en&dest=ru&text=%query%&email=%log%&password=%pass%';

var ROOT_ID = 'chrome_ggl_dict_ext';
var GRADIENT_DOWN_URL = chrome.runtime.getURL('img/gradient_down.png');
var GRADIENT_UP_URL = chrome.runtime.getURL('img/gradient_up.png');
var EXTERNAL_ICON_URL = chrome.runtime.getURL('img/external.png');
var SPEAKER_ICON_URL = chrome.runtime.getURL('img/speaker.png');

var TIMEOUT = 3000;
var NONE_STATUS = -1;
var CONNECTION_ERROR = -2;

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

// Helper to get extension version.
chrome.extension.getVersion = function() {
  if (!chrome.extension.version_) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.extension.getURL('manifest.json'), false);
    xhr.onreadystatechange = function() {
      if (this.readyState == 4) {
        var manifest = JSON.parse(this.responseText);
        chrome.extension.version_ = manifest.version;
      }
    };
    xhr.send();
  }
  return chrome.extension.version_;
};

// Server procedure for content script.
// Receives a request containing two parameters:
//   method:.
//     "retrieve" to retrieve an object from local storage.
//     "store" to store an object in the local storage.
//     "get_audio" to look up the URL of a given Wikimedia audio file.
//     "show_msg" - shows notification
//     "get_lookup_html" - gets translation from servers and creates HTML text
chrome.extension.onMessage.addListener(function(request, sender, callback) {
  if (request.method == 'retrieve') {
    // Return an object from local storage.
    callback(localStorage.getObject(request.options));
  } else if (request.method == 'store') {
    // Return an object from local storage.
    localStorage.setObject(request.key, request.value);
  } else if (request.method == 'get_audio') {
    // Lookup the URL of a given Wikimedia audio file
    var audio_url = AUDIO_API_URL.replace('%file%', request.filename);
    httpGetRequest(audio_url, function (response) {
      var audio_res = JSON.parse(response || '{}');
      var page_key = Object.keys(audio_res.query.pages)[0];
      var url = audio_res.query.pages[page_key].imageinfo[0].url;
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          method: 'play_audio',
          filename: request.filename,
          url: url
        });
      });
    });
  } else if (request.method == 'show_msg') {
    var opt = {
      type: 'list',
      title: request.title,
      message: request.message,
      priority: 1,
      items: [{ title: request.query, message: request.trans}],
      iconUrl:'http://www.google.com/favicon.ico'
    };
    chrome.notifications.create('', opt, function(id) {});
  } else if (request.method == 'get_lookup_html') {

    var queries = [];
    var translations = [];
    proceedLookup(request.query, request.options, queries, translations);
  } else {
    // Invalid request method. Ignore it.
    callback('');
  }
});

function httpGetRequest(url, callback) {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.open("GET", url, true);
  xmlHttp.onload = function (e) {
    if (xmlHttp.readyState == 4) {
      callback(xmlHttp.responseText);
    }
  }
  xmlHttp.timeout = TIMEOUT;
  xmlHttp.send(null);
}

// If new version is loaded, show the options page.
var current_version = chrome.extension.getVersion().split('.');
current_version = current_version[0] + '.' + current_version[1];

var saved_version = localStorage.getObject('version');
if (saved_version) {
  saved_version = saved_version.split('.');
  saved_version = saved_version[0] + '.' + saved_version[1];
} else {
  // Remap default modifier on different platforms.
  if (navigator.platform.match('Mac')) {
    localStorage.setObject('clickModifier', 'Meta');
    localStorage.setObject('shortcutModifier', 'Meta');
    localStorage.setObject('shortcutKey', 'D');
  } else if (navigator.platform.match('Linux')) {
    localStorage.setObject('clickModifier', 'Ctrl');
  } else {
    localStorage.setObject('clickModifier', 'Alt');
  }
}
if (saved_version != current_version) {
  localStorage.setObject('version', current_version);
  chrome.tabs.create({url: 'options.htm'});
}

// Creating parsing response functions
function parseMyMemory(response_text, translate_data) {
  if (!response_text || translate_data == null)  return;
  var parsed_res = JSON.parse(response_text);
  var matches = parsed_res.matches;
  var mymemory_mach_trans = '';
  var index_to_rem = -1;
  for (var i = 0; i < matches.length; ++i) {
    if (matches[i].reference.indexOf('Machine') > -1) {
      mymemory_mach_trans = koi2unicode(matches[i].translation);
      index_to_rem = i;
      break;
    }
  }
  if (index_to_rem != -1) {
    matches.splice(index_to_rem, 1);
  }
  translate_data.mach_trans = mymemory_mach_trans;
  var user_trans = [];
  for (var i in matches) {
    var match = matches[i];
    var trans = koi2unicode(match.translation);
    var ref = match.reference;
    var sour_name = '';
    if (ref) {
      if (ref.indexOf('http') > -1 || ref.indexOf('\/\/') > -1) { // If contains link to reference
        if (ref.indexOf('wiki') > -1)
          sour_name = 'Википедия';
        else
          sour_name = 'Перейти'; // That means source name just some Link :)
      }
      else {
        sour_name = ref; // If no link, just name to reference
      }
    }
    else {
      ref = '';
      sour_name = '';
    }
    user_trans.push(
      {
        query: match.segment,
        trans: trans,
        ref: ref,
        ref_name: sour_name
      }
    );
  }
  translate_data.users_trans = user_trans;
}

function parseYandex(response_text, translate_data) {
  if (!response_text || translate_data == null)  return;

  var yandex_dec_res = JSON.parse(response_text);
  translate_data.mach_trans = String(yandex_dec_res.text);
}

function parseFrenqly(response_text, translate_data) {
  if (!response_text || translate_data == null)  return;

  var parser = new DOMParser();
  var syslang_dec_res = parser.parseFromString(response_text, "text/xml");
  var trans = syslang_dec_res.getElementsByTagName("translation");
  if (trans== null || trans.length == 0) return;
  translate_data.mach_trans = String(syslang_dec_res.getElementsByTagName("translation")[0].childNodes[0].nodeValue);
}

function parseWictionary(response_text, translate_data) {
  if (!response_text || translate_data == null)  return;

  var dict_entry = JSON.parse(response_text || '{}');
  for (var i in dict_entry.audio) {
    var audio = dict_entry.audio[i];
    translate_data.pronun.audio_files.push(audio.file);
    translate_data.pronun.audio_types.push(audio.type);
  }
  for (var i in dict_entry.ipa) {
    translate_data.pronun.phonetic.push(dict_entry.ipa[i]);
  }
}

function proceedLookup(query, options, queries, translations) {
  // Creating URLs for requests
  var mymemory_trans_url = MYMEMORY_GET_LINK_TEMPLATE.replace('%query%', query);
  var yandex_trans_url = YANDEX_GET_LINK_TEMPLATE.replace('%query%', query);
  yandex_trans_url = yandex_trans_url.replace('%key%', options.yandexApiKey);
  var syslang_trans_url = FRENQLY_GET_LINK_TEMPLATE.replace('%query%', query);
  syslang_trans_url = syslang_trans_url.replace('%log%', options.frenqlyLogin);
  syslang_trans_url = syslang_trans_url.replace('%pass%', options.frenqlyPass);
  var dict_url = DICT_API_URL.replace('%query%', query);

  // Creating translation data for building HTML text
  var trans_data = [];
  if (options.yandexEnable) {
    trans_data.push(
      {
        url: yandex_trans_url,
        callback: parseYandex,
        name: 'Яндекс.Перевод',
        mach_trans: '',
        users_trans: [],
        status: NONE_STATUS,
        source: 'https://translate.yandex.ru/',
        pronun: {}
      }
    );
  }
  if (options.mymemoryEnable) {
    trans_data.push(
      {
        url: mymemory_trans_url,
        callback: parseMyMemory,
        name: 'MyMemory',
        mach_trans: '',
        users_trans: [],
        status: NONE_STATUS,
        source: 'http://mymemory.translated.net/',
        pronun: {}
      }
    );
  }
  if (options.frenqlyEnable) {
    trans_data.push(
      {
        url: syslang_trans_url,
        callback: parseFrenqly,
        name: 'Frenqly',
        mach_trans: '',
        users_trans: [],
        status: NONE_STATUS,
        source: 'http://www.frengly.com/',
        pronun: {}
      }
    );
  }
  if (options.showAudio || options.showIPA) {
    trans_data.push(
      {
        url: dict_url,
        callback: parseWictionary,
        name: 'Wictionary',
        mach_trans: '',
        users_trans: [],
        status: NONE_STATUS,
        source: 'http://www.wiktionary.org/',
        pronun: {
          phonetic: [],
          audio_files: [],
          audio_types: []
        }
      }
    );
  }

  // Getting responses for requests
  for (var i in trans_data) {
    proceedRequests(trans_data, i, query, options, queries, translations);
  }
}

function createHtmlFromLookup(query, options, trans_data, queries, translations) {

  for (var i in trans_data) {
    if (trans_data[i].status == NONE_STATUS) {
      return;
    }
  }
  // Ok, that means all requests was proceeded, with error or not
  for (var i in trans_data) {
    if (trans_data[i].status == CONNECTION_ERROR) {
      showMsg('Error appeared\nPlease check your internet connection')
      return;
    }
  }

  var buffer = [];

  buffer.push('<div id="' + ROOT_ID + '_content">');
  buffer.push('<div class="' + ROOT_ID + '_header">');
  buffer.push('<a class="' + ROOT_ID + '_title" >' + query + '</a>');
  if (options.showIPA) {
    for (var i in trans_data) {
      if (trans_data[i].pronun.phonetic && trans_data[i].pronun.phonetic.length) {
        for (var j in trans_data[i].pronun.phonetic) {
          buffer.push('<span class="' + ROOT_ID + '_phonetic" title="Phonetic">' + trans_data[i].pronun.phonetic[j] +
            '</span>');
        }
      }
    }
  }

  if (options.showAudio) {
    for (var i in trans_data) {
      if (trans_data[i].pronun.audio_files && trans_data[i].pronun.audio_files.length) {
        for (var j in trans_data[i].pronun.audio_files) {
          buffer.push('<span class="' + ROOT_ID + '_audio" data-src="' + trans_data[i].pronun.audio_files[j] + '">');
          buffer.push('<img class="' + ROOT_ID + '_speaker" src="' + SPEAKER_ICON_URL + '" title="Listen" />');
          buffer.push(' (' + trans_data[i].pronun.audio_types[j] + ')');
          if (options.showAudioLinks) {
            buffer.push('<a href="' + AUDIO_LINK_TEMPLATE.replace('%file%', trans_data[i].pronun.audio_files[j]) +
              '" target="_blank">');
            buffer.push('<img src="' + EXTERNAL_ICON_URL + '" title="Wikimedia Commons File Description" />');
            buffer.push('</a>');
          }
          buffer.push('</span>');
        }
      }
    }
  }
  buffer.push('</div><br>');

  var atleastOneMachTrans = false; // Checking that there are at least one machine translate
  for (var i in trans_data) {
    if (trans_data[i].mach_trans && trans_data[i].mach_trans.length)  atleastOneMachTrans = true;
  }

  var id = 0; // Count all translation: machine + users
  if (atleastOneMachTrans) {
    buffer.push('<strong>Машинный перевод</strong>');
    buffer.push('<hr class="' + ROOT_ID + '_separator" />');
    buffer.push('<ul class="' + ROOT_ID + '_translations">');
    for (var i in trans_data) {
      if (trans_data[i].mach_trans && trans_data[i].mach_trans.length) {
        buffer.push('<li id=' + 'li' + id + '><strong>' + trans_data[i].mach_trans + '</strong><br>');
        buffer.push('<em class="source">источник: ' +
          '<a href="' + trans_data[i].source + '" target="_blank">' + trans_data[i].name + '</a>' +
          '</em><br></li>');
        queries.push(query);
        translations.push(trans_data[i].mach_trans);
        ++id;
      }
    }
    buffer.push('</ul>');
    buffer.push('<br>');
  }

  buffer.push('<strong>Пользовательский перевод и референсы</strong>');
  buffer.push('<hr class="' + ROOT_ID + '_separator" />');
  buffer.push('<ul class="' + ROOT_ID + '_translations">');

  if (options.mymemoryUserTransEnable) {
    for (var i in trans_data) {
      if (trans_data[i].users_trans && trans_data[i].users_trans.length) {
        for (var j in trans_data[i].users_trans) {
          var trans = trans_data[i].users_trans[j];

          buffer.push('<li id=' + 'li' + id + '><strong>' + trans.query + '</strong> - ' + trans.trans + '<br>');
          if (trans.ref_name) {
            if (trans.ref) {
              buffer.push('<em class="source">источник: ' + '<a href=' + trans.ref + ' target="_blank">' +
                trans.ref_name + '</a>' + '</em><br>');
            }
            else {
              buffer.push('<em class="source">источник: ' + trans.ref_name + '<br>');
            }
          }
          buffer.push('</li>');
          queries.push(trans.query);
          translations.push(trans.trans);
          ++id;
        }
      }
    }
  }

  buffer.push('<li class="button_li"><button id="addbutt" class="addbutton">Добавить свой вариант</button></li>');
  buffer.push('</ul>');

  buffer.push('<div id="' + ROOT_ID + '_spacer"></div>');
  buffer.push('</div>');

  buffer.push('<span id="' + ROOT_ID + '_shader_top" style="background: url(\'' + GRADIENT_DOWN_URL + '\') repeat-x !important"></span>');
  buffer.push('<span id="' + ROOT_ID + '_shader_bottom" style="background: url(\'' + GRADIENT_UP_URL + '\') repeat-x !important"></span>');

  var html = buffer.join('');

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {
      method: 'set_html',
      html: html,
      query: query,
      queries: queries,
      trans: translations
    });
  });
}

// Function for execute http get (and set) requests and get answers (asynhronic)
function proceedRequests(data, index, query, options, queries, translations) {
  var url = data[index].url;
  var callback = data[index].callback;
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.open("GET", url, true);
  xmlHttp.onload = function (e) {
    if (xmlHttp.readyState == 4) {
      if (xmlHttp.status == 200) {
        callback(xmlHttp.responseText, data[index]);
      }
      data[index].status = xmlHttp.status;
      createHtmlFromLookup(query, options, data, queries, translations);
    }
  }
  xmlHttp.ontimeout = function (e) {
    data[index].status = xmlHttp.status;
    createHtmlFromLookup(query, options, data, queries, translations);
  }
  xmlHttp.onerror = function (e) {
    // TODO: Sometimes erorr appears when internet ok. WTF? Fix it
    data[index].status = CONNECTION_ERROR;
    createHtmlFromLookup(query, options, data, queries, translations);
  }
  xmlHttp.timeout = TIMEOUT;
  xmlHttp.send(null);
}

// Function for convert Koi8-r to Unicode
function koi2unicode(str) {
  var charmap   = unescape(
      "%u2500%u2502%u250C%u2510%u2514%u2518%u251C%u2524%u252C%u2534%u253C%u2580%u2584%u2588%u258C%u2590"+
      "%u2591%u2592%u2593%u2320%u25A0%u2219%u221A%u2248%u2264%u2265%u00A0%u2321%u00B0%u00B2%u00B7%u00F7"+
      "%u2550%u2551%u2552%u0451%u2553%u2554%u2555%u2556%u2557%u2558%u2559%u255A%u255B%u255C%u255D%u255E"+
      "%u255F%u2560%u2561%u0401%u2562%u2563%u2564%u2565%u2566%u2567%u2568%u2569%u256A%u256B%u256C%u00A9"+
      "%u044E%u0430%u0431%u0446%u0434%u0435%u0444%u0433%u0445%u0438%u0439%u043A%u043B%u043C%u043D%u043E"+
      "%u043F%u044F%u0440%u0441%u0442%u0443%u0436%u0432%u044C%u044B%u0437%u0448%u044D%u0449%u0447%u044A"+
      "%u042E%u0410%u0411%u0426%u0414%u0415%u0424%u0413%u0425%u0418%u0419%u041A%u041B%u041C%u041D%u041E"+
      "%u041F%u042F%u0420%u0421%u0422%u0423%u0416%u0412%u042C%u042B%u0417%u0428%u042D%u0429%u0427%u042A")
  var code2char = function(code) {
    if(code >= 0x80 && code <= 0xFF) return charmap.charAt(code - 0x80)
    return String.fromCharCode(code)
  }
  var res = ""
  for(var i = 0; i < str.length; i++) res = res + code2char(str.charCodeAt(i))
  return res;
}

function showMsg(msg) {
  // TODO: Create normal unific fuction for all types of notifications
  var opt = {
    type: 'list',
    title: msg,
    message: '',
    priority: 1,
    items: [{ title: '', message: ''}],
    iconUrl:'http://www.google.com/favicon.ico'
  };
  chrome.notifications.create('', opt, function(id) {});
}