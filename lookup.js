// CSS-related constants. Should be synced with frame.css.
var ROOT_ID = 'chrome_ggl_dict_ext';
var FORM_ID = ROOT_ID + '_form';
var PADDING_LEFT = 10;
var PADDING_RIGHT = 0;
var PADDING_TOP = 15;
var PADDING_BOTTOM = 15;
var PADDING_FORM = 10;
var BASE_Z_INDEX = 65000;

// URL constants.
var LOADER_ICON_URL = chrome.runtime.getURL('img/loader.gif');


// Internal global vars.
var body = document.getElementsByTagName('body')[0];
var breadcrumbs = [];
var last_query = null;
var audio_cache = {};

// Extension options with defaults.
var options = {
  clickModifier: 'None',
  shortcutModifier: 'Ctrl',
  shortcutKey: 'Q',
  shortcutEnable: true,
  shortcutSelection: false,
  yandexEnable: false,
  mymemoryEnable: true,
  mymemoryUserTransEnable: true,
  frenqlyEnable: false,
  yandexApiKey: '',
  frenqlyLogin: '',
  frenqlyPass: '',
  frameWidth: 550,
  frameHeight: 250,
  queryFormWidth: 250,
  queryFormHeight: 50,  // This one is an approximation for centering.
  hideWithEscape: true,
  saveFrameSize: true,
  showIPA: true,
  showAudio: true,
  showAudioLinks: true
}

// Two arrays to store last query translations and queries
var queries = [];
var translations = [];

/***************************************************************
 *                          Entry Point                        *
 ***************************************************************/

// Mouse coordinates and function that track it
var mouse_x;
var mouse_y;
document.onmousemove = function(e)
{
  mouse_x = e.pageX;
  mouse_y = e.pageY;
};

// Main initialization function. Loads options and sets listeners.
function initialize() {
  // Load options.
  function setOpt(opt) {
    chrome.runtime.sendMessage({method: 'retrieve', options: opt}, function(response) {
      if (response != null) options[opt] = response;
    });
  }

  for (var opt in options) {
    setOpt(opt);
  }

  // Manually inject the stylesheet into non-HTML pages that have no <head>.
  if (!document.head && document.body) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('frame.css');

    document.body.appendChild(link);
  }

  // Override label visibility.
  if (!options.showLabels) {
    label_style = document.createElement('style');
    label_style.type = 'text/css';
    label_style.innerText = '#chrome_ggl_dict_ext .label {display: none !important}';
    (document.head || document.body).appendChild(label_style);
  }

  // Set event listeners.
  window.addEventListener('keydown', handleKeypress, false);
  setTimeout(function() {
    if (options.clickModifier == 'None') {
      window.addEventListener('mousedown', function(e) {
        if (!isClickInsideFrame(e)) removePopup(true, true);
      }, false);
      window.addEventListener('dblclick', handleClick, false);
    } else {
      window.addEventListener('mouseup', handleClick, false);
    }
  }, 100);

  // Listener to catch messages from background script
  chrome.runtime.onMessage.addListener(
    function(request, sender) {
      if (request.method == 'set_html') {

        var wrapper = document.createElement('div');
        var html = request.html;
        if (!html || html.length == 0)  return;
        wrapper.innerHTML = html;

        var frame = document.getElementById(ROOT_ID);
        var children = frame.childNodes;
        while(children.length) {
          frame.removeChild(children[0])
        }

        for (var i = 0; i < wrapper.childNodes.length; i++) {
          frame.appendChild(wrapper.childNodes[i]);
        }

        // Data about queries and translation to store in dictionary
        queries = request.queries;
        translations = request.trans;

        // Button for manual add translation
        var add_button = document.getElementById('addbutt');
        add_button.addEventListener('click', function(e) {
          var req = new XMLHttpRequest();
          req.open("GET", 'https://cloud-api.yandex.net/v1/disk/resources/upload?path=%2Fhello.txt&overwrite=true', false);
          req.setRequestHeader('Authorization', 'OAuth 209c99da42254a5f93a8df094c1e5a06');
          req.send(null);
          var p = JSON.parse(req.responseText || '{}');
          window.prompt("Status: " + req.status, p.href);

          var new_data = 'hello world';
          var formData = new FormData();
          formData.append('attachment', new_data);

          var new_req = new XMLHttpRequest();
          new_req.open("PUT", p.href, false);
          new_req.setRequestHeader("Content-type", "multipart/form-data");
          new_req.send(formData);
          writeInDictionary('done', new_req.responseText + ' ' + new_req.status);
          window.prompt("Status: " + new_req.status, new_req.responseText);

          setTimeout(createQueryForm(mouse_x, mouse_y, 'Добавить', request.query, 'add_trans'), 100);
        }, false);

        // Configure events for click on translations in form
        for (var i = 0, len = translations.length; i < len; ++i) {
          var cur_elem = document.getElementById('li' + i);
          cur_elem.addEventListener('click', function (e) {
            writeInDictionary(queries[e.target.id[2]], translations[e.target.id[2]]);
          });
        }

        // Hook into audio icons.
        var spans = frame.getElementsByTagName('span');
        for (var i in spans) {
          if (spans[i].className == ROOT_ID + '_audio') {
            registerAudioIcon(spans[i].getElementsByTagName('img')[0],
              spans[i].attributes['data-src'].value);
          }
        }
      } else if (request.method == 'play_audio') { // Playing audio from retrieved url
        audio_cache[request.filename] = request.url;
        playAudio(request.url);
      }
    });
}

/***************************************************************
 *                        Event Handlers                       *
 ***************************************************************/
// Handle lookup-on-click.
function handleClick(e) {
  is_inside_frame = isClickInsideFrame(e);

  // If click outside the frame/form, remove it.
  if (!is_inside_frame) removePopup(true, true);

  // If the modifier is held down and we have a selection, create a pop-up.
  if (checkModifier(options.clickModifier, e)) {
    var query = getTrimmedSelection();
    if (isQueryOk(query)) {
      if (is_inside_frame) {
        if (last_query) breadcrumbs.push(last_query);
        navigateFrame(query);
      } else {
        breadcrumbs = [];
        createPopup(query, e.pageX, e.pageY, e.clientX, e.clientY, false);
      }
      e.preventDefault();
      getSelection().removeAllRanges();
    }
  }
}

// Handle keyboard shortcut.
function handleKeypress(e) {
  if (options.hideWithEscape && e.keyCode == 27) {
    removePopup(true, true);
    return;
  }

  if (!options.shortcutEnable) return;
  if (!checkModifier(options.shortcutModifier, e)) return;
  if (options.shortcutKey.charCodeAt(0) != e.keyCode) return;

  if (options.shortcutSelection && getTrimmedSelection() != '') {
    // Lookup selection.
    removePopup(true, true);
    breadcrumbs = [];
    createCenteredPopup(getTrimmedSelection());
  } else {
    // Show query form if it's not already visible or clear it otherwise.
    if (!document.getElementById(FORM_ID)) {
      removePopup(true, false);
      grayOut(true);
      //  Calculate the coordinates of the middle of the window.
      var windowX = (window.innerWidth - (PADDING_LEFT + options.queryFormWidth + PADDING_RIGHT)) / 2;
      var windowY = (window.innerHeight - (PADDING_TOP + options.queryFormHeight + PADDING_BOTTOM)) / 2;
      var x = body.scrollLeft + windowX;
      var y = body.scrollTop + windowY;
      // Argument query is null because function createQueryForm is universal for two situations and we dont have
      // query in this case
      createQueryForm(x, y, 'Перевести', null, 'manual_search');
    } else {
      document.getElementById(FORM_ID).getElementsByTagName('input')[0].value = '';
    }
  }
}

// Handle clicks on related terms.
function navigateFrame(query) {
  var frame_ref = document.getElementById(ROOT_ID);
  var fixed = (document.defaultView.getComputedStyle(frame_ref, null).getPropertyValue('position') == 'fixed');
  var zoom_ratio = getZoomRatio();
  createPopup(query,
      frame_ref.offsetLeft * zoom_ratio, frame_ref.offsetTop * zoom_ratio,
      frame_ref.offsetLeft * zoom_ratio - body.scrollLeft, frame_ref.offsetTop * zoom_ratio - body.scrollTop,
    fixed);
}

/***************************************************************
 *                        UI Controllers                       *
 ***************************************************************/
// Creates and shows the manual query form.
function createQueryForm(x, y, text, query, method) {
  // Check that query form is not already created
  var form = document.getElementById(FORM_ID);
  if (form)
    removePopup(false, true);

  // Create the form, set its id and insert it.
  var qform = document.createElement('div');
  qform.id = FORM_ID;
  body.appendChild(qform);

  // Set form style.
  var zoom_ratio = getZoomRatio();
  qform.style.position = 'absolute';
  qform.style.left = (x / zoom_ratio) + 'px';
  qform.style.top = (y / zoom_ratio) + 'px';
  qform.style.width = options.queryFormWidth + 'px';
  qform.style.zIndex = BASE_Z_INDEX;

  // Add textbox.
  textbox = document.createElement('input');
  textbox.type = 'text';
  qform.appendChild(textbox);

  textbox.focus();

  // Add button.
  button = document.createElement('input');
  button.type = 'button';
  button.value = text;
  qform.appendChild(button);

  // Function that will executed instructions after pressed button on form
  // because this form using for two situations: to add new trans and manual search
  function execute() {
    if (method == 'add_trans') {
      setTimeout(addTranslation(query, textbox.value), 200);
    }
    if (method == 'manual_search' && isQueryOk(textbox.value)) {
      setTimeout(createCenteredPopup(textbox.value), 200);
    }
    removePopup(false, true);
  }

  // Set lookup event handlers.
  textbox.addEventListener('keypress', function(e) {
    if (e.keyCode == 13) {  // Pressed Enter.
      setTimeout(execute(), 200);
    }
  }, false);

  button.addEventListener('click', function(e) {
    setTimeout(execute(), 200);
  }, false);

  // Schedule a resize of the textbox to accommodate the button in a single line.
  setTimeout(function() {
    var width = options.queryFormWidth - button.offsetWidth - 2 * PADDING_FORM - 3;
    textbox.style.width = width + 'px';
  }, 100);

  // Initiate the fade-in animation in after 100 milliseconds.
  // Setting it now will not trigger the CSS3 animation sequence.
  setTimeout(function() {
    qform.style.opacity = 1;
  }, 100);
}

// Create a centered pop-up.
function createCenteredPopup(query) {
  var windowX = (window.innerWidth - (PADDING_LEFT + options.frameWidth + PADDING_RIGHT)) / 2;
  var windowY = (window.innerHeight - (PADDING_TOP + options.frameHeight + PADDING_BOTTOM)) / 2;

  // Create new popup.
  createPopup(query, windowX, windowY, windowX, windowY, true);
}

// Create and fade in the dictionary popup frame and button.
function createPopup(query, x, y, windowX, windowY, fixed) {

  // If an old frame still exists, wait until it is killed.
  var frame_ref = document.getElementById(ROOT_ID);
  if (frame_ref) {
    if (frame_ref.style.opacity == 1) removePopup(true, false);
    setTimeout(function() {createPopup(query, x, y, windowX, windowY, fixed);}, 50);
    return;
  }

  // Create the frame, set its id and insert it.
  var frame = document.createElement('div');
  frame.id = ROOT_ID;
  // Unique class to differentiate between frame instances.
  frame.className = ROOT_ID + (new Date()).getTime();
  body.appendChild(frame);

  // Make frame draggable by its top.
  makeMoveable(frame, PADDING_TOP);

  // Create and show loading while retrieving data
  var wrapper = document.createElement('div');
  wrapper.innerHTML = getLoadingHtml();
  for (var i = 0; i < wrapper.childNodes.length; i++) {
    frame.appendChild(wrapper.childNodes[i]);
  }

  // Start to retrieve data and create html text in the background
  chrome.runtime.sendMessage({
    method: 'get_lookup_html',
    query: query,
    options: options
  }, function () {});

  // Calculate frame position.
  var window_width = window.innerWidth;
  var window_height = window.innerHeight;
  var full_frame_width = PADDING_LEFT + options.frameWidth + PADDING_RIGHT;
  var full_frame_height = PADDING_TOP + options.frameHeight + PADDING_BOTTOM;
  var top = 0;
  var left = 0;
  var zoom_ratio = getZoomRatio();

  if (windowX + full_frame_width * zoom_ratio >= window_width) {
    left = x / zoom_ratio - full_frame_width;
    if (left < 0) left = 5;
  } else {
    left = x / zoom_ratio;
  }

  if (windowY + full_frame_height * zoom_ratio >= window_height) {
    top = y / zoom_ratio - full_frame_height;
    if (top < 0) top = 5;
  } else {
    top = y / zoom_ratio;
  }

  // Set frame style.
  frame.style.position = fixed ? 'fixed' : 'absolute';
  frame.style.left = left + 'px';
  frame.style.top = top + 'px';
  frame.style.width = options.frameWidth + 'px';
  frame.style.height = options.frameHeight + 'px';
  frame.style.zIndex = BASE_Z_INDEX;
  frame.style.background = 'white url("' + LOADER_ICON_URL + '") center no-repeat !important';

  // Initiate the fade-in animation in after 100 milliseconds.
  // Setting it now will not trigger the CSS3 animation sequence.
  setTimeout(function() {
    frame.style.opacity = 1;
  }, 100);

  last_query = query;
}

function playAudio(url) {
  new Audio(url).addEventListener('canplaythrough', function() {
    this.play();
  });
}

function registerAudioIcon(icon, filename) {
  icon.addEventListener('click', function(e) {
    var src_element = this;
    if (audio_cache[filename]) {
      playAudio(audio_cache[filename], src_element);
    } else {
      chrome.runtime.sendMessage({method: 'get_audio', filename: filename}, function() {});
    }
  });
}

// Fade out then destroy the frame and/or form.
function removePopup(do_frame, do_form) {
  var form = document.getElementById(FORM_ID);

  if (form && do_form) {
    grayOut(false);
    form.style.opacity = 0;
    setTimeout(function() {if (form) body.removeChild(form);}, 400);
  }

  // Remember the current frame's unique class name.
  var frame_ref = document.getElementById(ROOT_ID);
  var frame_class = frame_ref ? frame_ref.className : null;

  if (frame_ref && do_frame) {
    frame_ref.style.opacity = 0;
    setTimeout(function() {
      var frame_ref = document.getElementById(ROOT_ID);
      // Check if the currently displayed frame is still the same as the old one.
      if (frame_ref && frame_ref.className == frame_class) {
        body.removeChild(frame_ref);
      }
    }, 400);
  }
}

/***************************************************************
 *                   General Helper Functions                  *
 ***************************************************************/
// Background graying function, based on:
// http://www.hunlock.com/blogs/Snippets:_Howto_Grey-Out_The_Screen
function grayOut(vis) {
  // Pass true to gray out screen, false to ungray.
  var dark_id = ROOT_ID + '_shader';
  var dark = document.getElementById(dark_id);
  var first_time = (dark == null);

  if (first_time) {
    // First time - create shading layer.
    var tnode = document.createElement('div');
    tnode.id = dark_id;

    tnode.style.position = 'absolute';
    tnode.style.top = '0px';
    tnode.style.left = '0px';
    tnode.style.overflow = 'hidden';

    document.body.appendChild(tnode);
    dark = document.getElementById(dark_id);
  }

  if (vis) {
    // Set the shader to cover the entire page and make it visible.
    dark.style.zIndex = BASE_Z_INDEX - 1;
    dark.style.backgroundColor = '#000000';
    dark.style.width = body.scrollWidth + 'px';
    dark.style.height = body.scrollHeight + 'px';
    dark.style.display = 'block';

    setTimeout(function() {dark.style.opacity = 0.7;}, 100);
  } else if (dark.style.opacity != 0) {
    setTimeout(function() {dark.style.opacity = 0;}, 100);
    setTimeout(function() {dark.style.display = 'none';}, 400);
  }
}

// Returns a trimmed version of the currently selected text.
function getTrimmedSelection() {
  var selection = String(window.getSelection());
  return selection.replace(/^\s+|\s+$/g, '');
}

// Returns the document body's zoom ratio.
function getZoomRatio() {
  var zoom_ratio = document.defaultView.getComputedStyle(body, null).getPropertyValue('zoom');
  return parseFloat(zoom_ratio || '0');
}

// Predicate to check whether the selected modifier key is active in an event.
function checkModifier(modifier, e) {
  switch (modifier) {
    case 'None':
      return true;
    case 'Ctrl':
      return e.ctrlKey;
    case 'Alt':
      return e.altKey;
    case 'Meta':
      return e.metaKey;
    case 'Ctrl+Alt':
      return e.ctrlKey && e.altKey;
    case 'Ctrl+Shift':
      return e.ctrlKey && e.shiftKey;
    case 'Alt+Shift':
      return e.altKey && e.shiftKey;
    default:
      return false;
  }
}

// Makes a container resizeable through dragging a handle.
function makeResizeable(container, handle) {
  var last_position = {x: 0, y: 0};
  var ruler = document.createElement('div');
  ruler.style.visibility = 'none';
  ruler.style.width = '100px';

  function moveListener(e) {
    var moved = {x: (e.clientX - last_position.x),
      y: (e.clientY - last_position.y)};

    var zoom_ratio = parseFloat(document.defaultView.getComputedStyle(ruler, null).getPropertyValue('width')) / 100;;
    var height = parseFloat(document.defaultView.getComputedStyle(container, null).getPropertyValue('height'));
    var width = parseFloat(document.defaultView.getComputedStyle(container, null).getPropertyValue('width'));
    var new_height = (height + moved.y) / zoom_ratio;
    var new_width = (width + moved.x) / zoom_ratio;

    if (moved.y > 0 || height >= 100) {
      last_position.y = e.clientY;
      container.style.height = new_height + 'px';
      content_box = document.getElementById(ROOT_ID + '_content');
      content_box.style.height = new_height + 'px';
      if (options.saveFrameSize) {
        options.frameHeight = new_height;
        chrome.runtime.sendMessage({method: 'store', key: 'frameHeight', value: new_height}, function(response) {});
      }
    }
    if (moved.x > 0 || width >= 250) {
      last_position.x = e.clientX;
      container.style.width = new_width + 'px';
      shader_top = document.getElementById(ROOT_ID + '_shader_top');
      shader_bottom = document.getElementById(ROOT_ID + '_shader_bottom');
      shader_top.style.width = (shader_top.offsetWidth + moved.x / zoom_ratio) + 'px';
      shader_bottom.style.width = (shader_bottom.offsetWidth + moved.x / zoom_ratio) + 'px';

      if (options.saveFrameSize) {
        options.frameWidth = new_width;
        chrome.runtime.sendMessage({method: 'store', key: 'frameWidth', value: new_width}, function(response) {});
      }
    }

    e.preventDefault();
  }

  handle.addEventListener('mousedown', function(e) {
    last_position = {x: e.clientX, y: e.clientY};
    window.addEventListener('mousemove', moveListener);
    body.appendChild(ruler);
    window.addEventListener('mouseup', function(e) {
      window.removeEventListener('mousemove', moveListener);
      try {
        body.removeChild(ruler);
      } catch (e) {}
      e.preventDefault();
    });
    e.preventDefault();
  });
}

// Makes a box moveable by dragging its top margin.
function makeMoveable(box, margin) {
  var last_position = {x: 0, y: 0};

  var dragger = document.createElement('div');
  dragger.id = ROOT_ID + '_dragger';
  dragger.style.height = margin + 'px !important';
  box.appendChild(dragger);

  function moveListener(e) {
    var moved = {x: (e.clientX - last_position.x),
      y: (e.clientY - last_position.y)};
    last_position = {x: e.clientX, y: e.clientY};
    box.style.top = (box.offsetTop + moved.y) + 'px';
    box.style.left = (box.offsetLeft + moved.x) + 'px';

    e.preventDefault();
  }

  dragger.addEventListener('mousedown', function(e) {
    last_position = {x: e.clientX, y: e.clientY};
    window.addEventListener('mousemove', moveListener);
    window.addEventListener('mouseup', function(e) {
      window.removeEventListener('mousemove', moveListener);
      e.preventDefault();
    });
    e.preventDefault();
  });
}

function isClickInsideFrame(e) {
  frame_ref = document.getElementById(ROOT_ID);
  if (frame_ref) {
    var x, y;
    if (frame_ref.style.position == 'absolute') {
      x = e.pageX;
      y = e.pageY;
    } else if (frame_ref.style.position == 'fixed') {
      x = e.clientX;
      y = e.clientY;
    }

    var zoom_ratio = getZoomRatio();
    x /= zoom_ratio;
    y /= zoom_ratio;

    if (x >= frame_ref.offsetLeft &&
      x <= frame_ref.offsetLeft + frame_ref.offsetWidth &&
      y >= frame_ref.offsetTop &&
      y <= frame_ref.offsetTop + frame_ref.offsetHeight) {
      return true;
    }
  }

  return false;
}

// Function for add new users translation
function addTranslation(query, translation) {
  // TODO: Add here asynhronic reqauest and use options.mymemoryUserTransEnable
//  var mymemory_set_url = MYMEMORY_SET_LINK_TEMPLATE.replace('%query%', query);
//  mymemory_set_url = mymemory_set_url.replace('%trans%', translation);
//  proceedRequests(mymemory_set_url); // But we dont care about result, so wouldnt check it
  writeInDictionary(query, translation);
}

// Function for write in the dictionary file new translate
function writeInDictionary(query, translation) {
  chrome.runtime.sendMessage({
    method: 'show_msg',
    title: 'Добавлен новый перевод',
    message: '',
    query: query,
    trans: translation
  }, function () {});
}

// function for detect russian language
function isCorrect(query) {
  if (RegExp("[A-Za-z]").test(query))
    return true;
  else
    return false;
}

function isQueryOk(query) {
  return (query && isCorrect(query));
}

// Function returs HTML text with loading animation based on CSS style elements
function getLoadingHtml() {
  return '<div id="circularG">\
    <div id="circularG_1" class="circularG">\
    </div>\
      <div id="circularG_2" class="circularG">\
      </div>\
      <div id="circularG_3" class="circularG">\
      </div>\
      <div id="circularG_4" class="circularG">\
      </div>\
      <div id="circularG_5" class="circularG">\
      </div>\
      <div id="circularG_6" class="circularG">\
      </div>\
      <div id="circularG_7" class="circularG">\
      </div>\
      <div id="circularG_8" class="circularG">\
      </div>\
    </div>';
}

/********************************** Let's go! *****************************************/
initialize();