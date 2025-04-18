/**
 * @module DOMUtils
 * @description A comprehensive utility module for DOM manipulation, resource loading, and font management
 */

// Feature detection constants
const hasNativeBind = typeof Function.prototype.bind === 'function' && 
                     /native code/.test(Function.prototype.bind.toString());
const hasFontFaceAPI = typeof FontFace !== 'undefined';

/**
 * Creates a bound function with optional prepended arguments
 * @param {Function} fn - The function to bind
 * @param {Object} context - The context to bind to
 * @param {...*} [partialArgs] - Arguments to prepend
 * @returns {Function} The bound function
 */
function createBoundFunction(fn, context, ...partialArgs) {
  if (typeof fn !== 'function') {
    throw new TypeError('First argument must be a function');
  }

  if (partialArgs.length > 0) {
    return function(...callArgs) {
      return fn.apply(context, [...partialArgs, ...callArgs]);
    };
  }
  
  return function(...callArgs) {
    return fn.apply(context, callArgs);
  };
}

/**
 * Cross-browser timestamp utility
 * @returns {number} Current timestamp in milliseconds
 */
const getCurrentTimestamp = Date.now || (() => +new Date());

/**
 * Represents a document environment (main window or iframe)
 */
class DocumentEnvironment {
  /**
   * @param {Window} mainWindow - The main window reference
   * @param {Window} [contentWindow] - The content window (for iframes)
   */
  constructor(mainWindow, contentWindow) {
    this.mainWindow = mainWindow;
    this.contentWindow = contentWindow || mainWindow;
    this.document = this.contentWindow.document;
  }

  /**
   * Gets the appropriate protocol (http: or https:)
   * @returns {string} The protocol
   */
  get protocol() {
    const { protocol } = this.contentWindow.location;
    return protocol === 'about:' ? this.mainWindow.location.protocol : protocol;
  }

  /**
   * Gets the hostname
   * @returns {string} The hostname
   */
  get hostname() {
    return this.contentWindow.location.hostname || this.mainWindow.location.hostname;
  }
}

/**
 * DOM element utilities
 */
class DOMUtils {
  /**
   * Creates an element with attributes and content
   * @param {Document} document - The document object
   * @param {string} tagName - The element tag name
   * @param {Object} [attributes] - Element attributes
   * @param {string} [textContent] - Text content
   * @returns {HTMLElement} The created element
   */
  static createElement(document, tagName, attributes = {}, textContent = '') {
    const element = document.createElement(tagName);

    Object.entries(attributes).forEach(([name, value]) => {
      if (name === 'style' && typeof value === 'string') {
        element.style.cssText = value;
      } else {
        element.setAttribute(name, value);
      }
    });

    if (textContent) {
      element.appendChild(document.createTextNode(textContent));
    }

    return element;
  }

  /**
   * Appends an element to a parent
   * @param {Document} document - The document object
   * @param {string} parentTag - The parent tag name
   * @param {HTMLElement} element - The element to append
   */
  static appendElement(document, parentTag, element) {
    const parent = document.getElementsByTagName(parentTag)[0] || 
                   document.documentElement;
    parent.insertBefore(element, parent.lastChild);
  }

  /**
   * Removes an element from the DOM
   * @param {HTMLElement} element - The element to remove
   */
  static removeElement(element) {
    element.parentNode?.removeChild(element);
  }

  /**
   * Manages element classes
   */
  static classList = {
    /**
     * Adds and removes classes from an element
     * @param {HTMLElement} element - The target element
     * @param {string[]} [classesToAdd] - Classes to add
     * @param {string[]} [classesToRemove] - Classes to remove
     */
    update(element, classesToAdd = [], classesToRemove = []) {
      const currentClasses = new Set(element.className.split(/\s+/));
      
      classesToAdd.forEach(className => currentClasses.add(className));
      classesToRemove.forEach(className => currentClasses.delete(className));
      
      element.className = Array.from(currentClasses)
        .filter(Boolean)
        .join(' ')
        .trim();
    },

    /**
     * Checks if an element has a class
     * @param {HTMLElement} element - The target element
     * @param {string} className - The class to check
     * @returns {boolean}
     */
    has(element, className) {
      return element.className.split(/\s+/).includes(className);
    }
  };
}

/**
 * Resource loader for scripts and stylesheets
 */
class ResourceLoader {
  /**
   * Loads a stylesheet
   * @param {DocumentEnvironment} env - Document environment
   * @param {string} url - Stylesheet URL
   * @param {Function} [callback] - Completion callback
   */
  static loadStylesheet(env, url, callback) {
    const link = DOMUtils.createElement(env.document, 'link', {
      rel: 'stylesheet',
      href: url,
      media: 'all'
    });

    if (hasFontFaceAPI) {
      let isComplete = false;

      link.onload = () => {
        if (!isComplete) {
          isComplete = true;
          callback?.(null);
        }
      };

      link.onerror = () => {
        if (!isComplete) {
          isComplete = true;
          callback?.(new Error(`Stylesheet failed to load: ${url}`));
        }
      };
    } else {
      setTimeout(() => callback?.(null), 0);
    }

    DOMUtils.appendElement(env.document, 'head', link);
  }

  /**
   * Loads a script with timeout
   * @param {DocumentEnvironment} env - Document environment
   * @param {string} url - Script URL
   * @param {Function} [callback] - Completion callback
   * @param {number} [timeout=5000] - Timeout in ms
   * @returns {HTMLScriptElement} The script element
   */
  static loadScript(env, url, callback, timeout = 5000) {
    const head = env.document.getElementsByTagName('head')[0];
    if (!head) return null;

    const script = DOMUtils.createElement(env.document, 'script', { src: url });
    let isLoaded = false;

    const cleanup = () => {
      script.onload = script.onerror = script.onreadystatechange = null;
      if (script.parentNode === head) {
        head.removeChild(script);
      }
    };

    const done = (error = null) => {
      if (!isLoaded) {
        isLoaded = true;
        cleanup();
        callback?.(error);
      }
    };

    script.onload = done;
    script.onerror = () => done(new Error(`Script load failed: ${url}`));
    script.onreadystatechange = () => {
      if (/^(complete|loaded)$/.test(script.readyState)) {
        done();
      }
    };

    head.appendChild(script);
    setTimeout(() => done(new Error(`Script load timeout: ${url}`)), timeout);

    return script;
  }
}

/**
 * Tracks asynchronous operations
 */
class AsyncOperationTracker {
  constructor() {
    this.pendingCount = 0;
    this.completionCallback = null;
  }

  /**
   * Starts tracking an operation
   * @returns {Function} A function to call when the operation completes
   */
  beginOperation() {
    this.pendingCount++;
    let called = false;

    return () => {
      if (!called) {
        called = true;
        this.pendingCount--;
        this.checkCompletion();
      }
    };
  }

  /**
   * Sets the completion callback
   * @param {Function} callback - Called when all operations complete
   */
  setCompletionCallback(callback) {
    this.completionCallback = callback;
    this.checkCompletion();
  }

  checkCompletion() {
    if (this.pendingCount === 0 && this.completionCallback) {
      this.completionCallback();
      this.completionCallback = null;
    }
  }
}

/**
 * Normalizes strings for consistent naming
 */
class StringNormalizer {
  /**
   * @param {string} [separator='-'] - Word separator
   */
  constructor(separator = '-') {
    this.separator = separator;
  }

  /**
   * Normalizes strings to lowercase with separator
   * @param {...string} strings - Strings to normalize
   * @returns {string} The normalized string
   */
  normalize(...strings) {
    return strings
      .map(s => s.replace(/[\W_]+/g, '').toLowerCase())
      .filter(Boolean)
      .join(this.separator);
  }
}

/**
 * Represents a font variant
 */
class FontVariant {
  /**
   * @param {string} family - Font family name
   * @param {string} [variant='n4'] - Variant string (format [nio][1-9])
   */
  constructor(family, variant = 'n4') {
    this.family = family;
    const match = variant.match(/^([nio])([1-9])$/i);
    
    this.style = match?.[1]?.toLowerCase() || 'n';
    this.weight = match?.[2] ? parseInt(match[2], 10) : 4;
  }

  /**
   * Generates CSS @font-face declaration
   * @returns {string} The CSS string
   */
  toCSS() {
    return `${this.style} ${this.weight}00 300px ${this.family}`;
  }

  /**
   * Gets the font family string
   * @returns {string}
   */
  get familyString() {
    // Additional processing could be added here
    return this.family;
  }
}

// Export the API
const DOMUtilities = {
  bind: hasNativeBind ? Function.prototype.bind : createBoundFunction,
  getTimestamp: getCurrentTimestamp,
  DocumentEnvironment,
  DOMUtils,
  ResourceLoader,
  AsyncOperationTracker,
  StringNormalizer,
  FontVariant
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtilities;
} else if (typeof window !== 'undefined') {
  window.DOMUtilities = DOMUtilities;
}