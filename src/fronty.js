/*
  fronty.js: Component-based front-end JavaScript library
  author: lipido
*/

/** 
 *  Class representing a component, which is an object whose responsibilities
 *  are:
 *  <ul>
 *    <li>Render the HTML results of a provided
 *    {@link Component#renderer|renderer function} inside a specified element of
 *   the showing document, making as less DOM changes as possible.</li>
 *    <li>Manage nested child components. Child components are components which
 *      render in an element inside this component. When <em>this</em> Component
 *      re-renders, it restores its child's subtrees on their places. Child Components
 *      can be added manually (See {@link Component#addChildComponent}) or created
 *      dynamically by <em>this</em> Component via 
 *      "fronty-component" attribute or via custom tag elements 
 *      (See {@link Component#createChildComponent} and {@link Component#childTags}).</li>
 *    <li>Manage event listeners, restoring them each re-rendering.</li>
 *  </ul>
 *  <p>Components render when you call {@link Component#start|start()}, 
 * and update each time you call the {@link Component#render|render()}
 * function.</p>
 *
 * @example
 * <!-- html page -->
 * <body>
 *  <div id="mycomponent"></div>
 * </body>
 *
 * @example
 * //Javascript
 * var counter = 1;
 * var component = new Component(
 *  () => '<div>Counter: <span>'+counter+'</span></div>', // renderer function
 *  'mycomponent' // HTML element id
 *  );
 * component.start(); // first render
 * setInterval(() => {
 *    counter++; 
 *    component.render(); // component re-render
 * }, 1000);
 */
class Component {


  /**
   * Creates a new Component.
   *
   * @constructor
   * @param {Function} renderer A non-parameter function that returns HTML.
   * @param {String} htmlNodeId The id of the HTML element where this Component should 
   *                              render to.
   * @param {Array.<String>} [childTags] An optional Array of strings of custom-tags for
   *                         dynamically created child Components 
   *                        (See {@link Component#createChildComponent}).
   */
  constructor(renderer, htmlNodeId, childTags) {

    /**
     * The renderer function.
     *
     * @name Component#renderer
     * @type Function
     * @callback
     * @return {String} HTML content. It <strong>must</strong> return a single root element.
     * @default null
     */
    this.renderer = renderer;

    /**
     * The HTML element id where it renders into.
     * @name Component#htmlNodeId
     * @type String
     * @default null
     */
    this.htmlNodeId = htmlNodeId;

    /**
     * The optional name of custom element tags where child Components will
     * be created dynamically.<br>
     *
     * During render, if in the HTML provided by the {@link Component#renderer|renderer function}
     * one of these tags is found, the {@link Component#createChildComponent|createChildComponent()}
     * function is called.
     *
     * @name Component#childTags
     * @type String
     * @default empty array
     */
    this.childTags = (childTags) ? childTags : [];

    // do not render until the component is started with start()
    /**
     * Whether this Component is stopped.<br>
     * 
     * Stopped Components do not render.
     *
     * @name Component#stopped
     * @type Boolean
     * @default true
     */
    this.stopped = true;

    /**
     * The event listeners that this Component is managing. 
     * See {@link Component#addEventListener|addEventListener()}.
     *
     * @name Component#eventListeners
     * @type {Object.<string, {callback: Function, eventType: String}>}
     */
    this.eventListeners = [];

    /**
     * The array of child components.
     *
     * @name Component#childComponents
     * @type Array.<Component>
     */
    this.childComponents = [];

    /**
     * The child components, arranged by their HTML element id.
     *
     * @name Component#childComponentIds
     * @type Object.<string, Component>
     */
    this.childComponentIds = {};

    /////// "private" members

    // The global event listener placed on the root element of this Component
    this._boundEventsListener = this._eventsListener.bind(this);

    // The DOM tree of this component as it was in the previous render.
    // We will not compare the new rendered trees coming from the renderer function
    // to the real DOM. Why? We want that third-party libraries could do some changes
    // in the real DOM so, if it is not necessary, we will try not to overwrite their 
    // changes. To achieve this, we keep a "virtual DOM" that may not be
    // exactly the real DOM, so we only change things that are under our control,
    // things that we added in the previous render.
    this._previousVirtualDOM = null;

    // Elements where fronty-component attribute is found
    this._nodesWithFrontyComponentAttribute = [];

    // An object for parsing HTML into DOM (classic root.innerHTML=htmlstring)
    // We delegate on a "parsing service" object in order to allow the
    // accumulation of multiple parsing requests and call "innerHTML = ..." once,
    // instead of multiple times, which is faster.
    this._parsingService = Component._defaultParsingService;
  }


  /**
   * Gets the HTML element's id where this Component should render.
   *
   * <p>This element will be replaced with the contents of this component
   * renderer function.</p>
   *
   * @returns {String} The HTML node id where this Component is rendered.
   */
  getHtmlNodeId() {
    return this.htmlNodeId;
  }

  /**
   * Sets the HTML element id where this Component should render in the next
   * rendering.
   *
   * <p>The element will be replaced with the contents of this component
   * renderer function.</p>
   *
   * @param {String} htmlNodeId The HTML node id where this Component will
   *                            be rendered.
   */
  setHtmlNodeId(htmlNodeId) {
    this.htmlNodeId = htmlNodeId;
    this._resetVirtualDOM();
  }

  //// children management

  /**
   * Adds a child Component to this Component.
   *
   * <p>The HTML element where the child Component will render will not be re-rendered
   * when <em>this</em> Component (the parent) is re-rendered.</p>
   *
   * <p>The child component will be started (and thus immediately rendered) or stopped 
   * if this Component is currently started or stopped, respectively.</p>
   *
   * @param {Component} component The child Component.
   */
  addChildComponent(component) {
    this.childComponents.push(component);
    this.childComponentIds[component.getHtmlNodeId()] = component;

    if (this.stopped) {
      component.stop();
    } else {
      component.start();
    }
  }

  /**
   * Creates a new child Component for a specified class name to be placed in a
   * given HTML element. This method is intended to be overrided
   * by subclasses.
   *
   * <p>Parent components define where to create new children via their rendered 
   * HTML in two ways:
   * <ul>
   * <li>Via <code>fronty-component</code> attribute. An element like
   * <code>&lt;div fronty-component="ChildComponent"&gt;&lt;/div&gt;</code>
   * indicates that <code>ChildComponent</code> instances should be created and rendered
   * on that element.</li>
   *
   * <li>Via custom HTML tag. These tags
   * must be indicated in the constructor of the component. For example:
   * <code>new Component(renderer, 'parentId', ['ChildComponent'])</code>,
   * indicates that <code>ChildComponent</code> should be created
   * and rendered into when elements with this tag name are found.
   * <b>Note:</b> Remember that custom HTML tags do not work at any
   * place. For example, as child of a <code>&lt;table&gt;</code> element.</li>
   * </ul></p>
   * <p>Everytime a new element indicating that a child should be created, this
   * method is called to create the real instance.</p>
   * 
   * <p><b>Note:</b> By default, this function uses <code>eval(''+className)</code>
   * to create the instance. If you are packing your application and this library
   * in different modules, eval may fail in finding the className. You must 
   * override the method to create the child.</p>
   *
   * @param {String} className The class name found in the HTML element
   * @param {Node} element The HTML element where the new child will be placed
   * @param {String} id The HTML id found in the tag.
   * @return {Component} The new created child component.
   * @see {@link Component#childTags}
   */
  createChildComponent(className, element, id) {
    var constructorFunction = eval('' + className); //jshint ignore:line

    if (constructorFunction instanceof Function) {
      return new constructorFunction(id);
    }
  }

  /**
   * Removes a child Component from this Component.
   *
   * <p>After the child removal, <em>this</em> component will re-render.</p>
   *
   * @param {Component} component The child Component.
   */
  removeChildComponent(component) {
    var index = this.childComponents.indexOf(component);

    if (index != -1) {
      this.childComponents[index].stop();
      this.childComponents.splice(index, 1);
      delete this.childComponentIds[component.getHtmlNodeId()];
    }
    this.render();
  }

  /**
   * Gets the child Components of this Component.
   *
   * @returns {Array.<Component>} The child Components.
   */
  getChildComponents() {
    return this.childComponents;
  }

  /**
   * Gets the child Components arranged by id.
   *
   * @returns {Array.<String, Component>} The child Components arranged by id.
   */
  getChildComponentsById() {
    return this.childComponentIds;
  }

  /**
   * Gets a child Component given its HTML element id.
   *
   * @param {String} id The HTML element id.
   * @returns {Component} The child Component.
   */
  getChildComponent(id) {
    return this.childComponentIds[id];
  }

  //// rendering
  /**
   * Render this Component, which consists in:
   * <ol>
   * <li>Save the child Component DOM trees, because they may be moved to another place in the DOM.</li>
   * <li>Call the {@link Component#renderer|renderer function}.</li>
   * <li>Calculate the differences between the previous "virtual" DOM of this Component
   * and the new "virtual" DOM provided by the renderer function, skipping those
   * elements where child nodes are rendering.</li>
   * <li>Patch the real DOM with the previously computed differences.</li>
   * <li>Patch the previous "virtual" DOM with the previously computed differences,
   * and save it as the next previous "virtual" DOM.</li>
   * <li>Restore the child Components in their new places if they where moved to another
   * part in the DOM.</li>
   * <li>Restore event listeners in their corresponding elements, because 
   * some could be moved to another place in the DOM.</li>
   * <li>Create child nodes if new elements with tag name in
   * {@link Component#childTags} are found in the HTML.</li>
   * </ol> 
   */
  render() {

    if (this.rendering === true) {
      //avoid recursion
      return;
    }

    if (this.stopped || !this.htmlNodeId || this._getComponentNode() === null) {
      // if the component is stopped, there is no id to render o the document
      // do not contains the id to render to
      return;
    }

    this.rendering = true;

    this.beforeRender(); //hook

    // save child component subtrees
    var savedChildNodes = this._saveChildNodes();

    // call the render function
    var htmlContents = this.renderer();

    // the HTML is a string, parse it and then render
    this._getDOMFromRendererOutput(htmlContents,
      (newTree) => {

        // compute the differences between the previous DOM and the newTree,
        // updating both the real DOM and the previous DOM.
        this._renderNewTree(newTree);

        // restore child component subtrees
        this._restoreChildNodes(savedChildNodes);

        // put the global event listener on the root of this component
        this._updateEventListeners();

        // create all children that may have appeared in the form of
        // custom tag HTML elements, or elements with the "fronty-component"
        // attribute.
        this._createChildComponents();


        this.afterRender(); //hook

        this.rendering = false;
      });
  }

  // lifecycle management
  /**
   * Stops this Component and all of its children.<br>
   *
   * Stopped Components do not render. Once this Component 
   */
  stop() {
    if (this.stopped === false) {
      this.stopped = true;

      for (let i = 0; i < this.childComponents.length; i++) {
        var child = this.childComponents[i];
        child.stop();
      }
    }

    this.onStop();
  }

  /**
   * Starts this Component and all of its children.<br>
   *
   * A Component need to be started in order to render. If this Component
   * was stopped, it will render. Once this Component has been started and
   * rendered, the {@link Component#onStart|onStart()} hook is called.
   */
  start() {
    if (this.stopped) {
      this.stopped = false;

      this._resetVirtualDOM();
      this.render();

      for (let i = 0; i < this.childComponents.length; i++) {
        var child = this.childComponents[i];
        child.start();
      }
    }
    this.onStart();
  }

  // event-listener management
  /**
   * Adds an event listener to HTML element(s) inside this Component.<br>
   *
   * Listeners added to elements controlled by this Component should be added
   * via this method, not directly to the HTML elements, because they can be
   * removed during re-render. Listeners added with this method are always 
   * restored to the elements matching the selector query after rendering.
   *
   * @param {String} eventType The event type to be added to the elements.
   * @param {String} nodesQuery A HTML selector query to find elements to
   * attach the listener to.
   * @param {Function} callback The callback function to dispatch the event.
   */
  addEventListener(eventType, nodesQuery, callback) { ///HOLA

    this.eventListeners.push({
      query: nodesQuery,
      callback: callback,
      eventType: eventType
    });

    var rootNode = this._getComponentNode();
    if (rootNode !== null) {
      this._getComponentNode().removeEventListener(eventType, this._boundEventsListener);
      this._getComponentNode().addEventListener(eventType, this._boundEventsListener);
    }
  }


  // Hooks

  /**
   * Hook function called by this Component before rendering. As a hook, it is
   * intended to be overriden by subclasses.
   */
  beforeRender() { //hook
  }

  /**
   * Hook function called by this Component after rendering. As a hook, it is
   * intended to be overriden by subclasses.
   */
  afterRender() { //hook
  }

  /**
   * Hook function called by this Component just after start. As a hook, it is
   * intended to be overriden by subclasses.
   */
  onStart() { //hook
  }

  /**
   * Hook function called by this Component just after stop. As a hook, it is
   * intended to be overriden by subclasses.
   */
  onStop() { //hook
  }

  // "private" methods
  _renderNewTree(newTree) {

    let firstRender = this._previousVirtualDOM === null;

    //  Get the currentTree to we will compare against
    let currentTree = null;
    if (!firstRender) {
      // re-render. Restore the previous tree
      currentTree = this._previousVirtualDOM.firstChild;
    } else {
      // first render, the currentTree to compare against is the actual DOM element
      // where we will render
      currentTree = this._getComponentNode();
      // clean the destiny node
      while (currentTree.firstChild) {
        currentTree.removeChild(currentTree.firstChild);
      }
    }

    // copy id attribute to the root element of this component.
    // the component does not need to specify any id in its rendering function
    // root element
    if (newTree.nodeType === Node.ELEMENT_NODE) {
      newTree.setAttribute('id', this.getHtmlNodeId());
    }

    // TODO: create here a hook to preprocess newTree before comparing

    // compare the two trees: currentTree vs. newTree. 
    // This comparison is between the two virtual DOM trees
    var patches = TreeComparator.diff(currentTree, newTree, (node1, node2) => {

      // Special policy to do this comparison:

      // 1. Ignore and totally replace the contents of the destinty node if we are in the first render. 
      if (firstRender) return TreeComparator.COMPARE_POLICY_REPLACE;

      // 2. Skip comparisons on our children Component slots (child components are the responsible ones) 
      // The parent component, once re-rendered, should not touch children root nodes, since
      // they are under control of child components.
      if (node1.id && node2.id && node1.id === node2.id && (node1.id in this.childComponentIds)) {
        return TreeComparator.COMPARE_POLICY_SKIP;
      }

      if (node1.id && (node1.id in this.childComponentIds)) {
        // we want to compare a child component slot with another element, do a complete
        // replacement
        return TreeComparator.COMPARE_POLICY_REPLACE;
      }

      // By default, do a regular comparison
      return TreeComparator.COMPARE_POLICY_DIFF;
    });

    // Apply patches to the REAL DOM
    TreeComparator.applyPatches(patches, (patch) => {

      // However, the patches contains nodes from the "virtual" DOM trees, not
      // of the real DOM. We need no get the real nodes.
      // Moreover, we will clone the nodes being inserted in the real DOM because
      // we will reuse these patches to also patch our current virtual DOM so nodes
      // cannot have two parents!
      // To do these, we can use the patchMapping parameter of TreeComparator.applyPatches(),
      // which allows us to change each being applied by another patch.

      patch = Object.assign({}, patch); // shallow copy of the patch

      // toReplace will be the real DOM node. In our virtual DOM, each node
      // has a reference to the real DOM node (see the next few lines).
      patch.toReplace = this._resolveRealNode(patch.toReplace);

      if (patch.mode === TreeComparator.PATCH_INSERT_NODE ||
        patch.mode === TreeComparator.PATCH_APPEND_CHILD ||
        patch.mode === TreeComparator.PATCH_REPLACE_NODE) {

        // If we will insert new nodes, we will clone them as well as
        // to add a reference from the cloned nodes (which will remain in our
        // virtual DOM) to the corresponding clones (which will be inserted in the real DOM)
        patch.replacement = this._cloneAndIndex(patch.replacement);

      } else if (patch.mode === TreeComparator.PATCH_SWAP_NODES) {
        // in swap-nodes mode, both are nodes to be found in the real DOM,
        // so we search for the replacement in the real DOM
        patch.replacement = this._resolveRealNode(patch.replacement);
      }

      return patch;
    });

    if (firstRender) {
      // in the first render, the next previous tree will be the current newTree

      this._previousVirtualDOM = document.createElement('div');
      this._previousVirtualDOM.appendChild(newTree);
    } else {
      // On re-render it will be the patches previous virtual DOM
      //this._previousVirtualDOM.replaceChild(currentTree, this._previousVirtualDOM.firstChild);
      TreeComparator.applyPatches(patches);
    }
  }

  /*
   * Creates a new DOM tree from the renderer output. If the renderer output
   * is a string, we will get the dom by using the this._parsingService.
   * If it is a DOM tree, we do not anything.
   */
  _getDOMFromRendererOutput(htmlContents, callback) {
    if (typeof htmlContents === 'string') {
      // We need to parse

      htmlContents = this.renderer().trim();
      var correctedHtmlContents = htmlContents;
      // construct the new tree given by the render function
      // fix: for roots starting with TR, TD or TH, they cannot be direct
      // childs of div, they must be inside of a table to parse them with 
      // innerHTML
      if (htmlContents.match(/^<tr .*/i) !== null) {
        // trees starting with TR
        correctedHtmlContents = '<table><tbody>' + htmlContents + '</tbody></table>';
      } else if (htmlContents.match(/^<t[dh] .*/i) !== null) {
        // trees starting with TD or TH
        correctedHtmlContents = '<table><tbody><tr>' + htmlContents + '</tr></tbody></table>';
      }

      let newTree = document.createElement('div');

      this._parsingService.parse(correctedHtmlContents, (node) => {
        if (htmlContents.match(/^<tr .*/i) !== null) {
          newTree.appendChild(node.firstChild.firstChild);
        } else if (htmlContents.match(/^<t[dh] .*/i) !== null) {
          newTree.appendChild(node.firstChild.firstChild.firstChild);
        } else {


          newTree.appendChild(node);
        }
        if (newTree.childNodes.length > 1) {
          throw 'Rendering function MUST return a tree with a single root element ' + newTree.innerHTML;
        }

        callback(newTree.firstChild);
      });
    } else {

      // htmlContents is a real DOM
      callback(htmlContents);
    }
  }

  _resolveRealNode(node) {

    // if the node has an id of a child node, we find it via id
    if (node.id !== undefined && this.childComponentIds[node.id] !== undefined) {
      return document.getElementById(node.id);
    }

    // use the reference from the node to its corresponding clone in the real DOM
    let result = node.realNode;

    // No realNode? try to find by id (this is needed for the first render, where the new root node
    // has the id of the slot of the component)
    if (result === null || result === undefined && node.id !== undefined) {
      result = document.getElementById(node.id);
    }

    return result;
  }

  _resetVirtualDOM() {
    this._previousVirtualDOM = null;
    this._nodesWithFrontyComponentAttribute = [];
  }

  /*
   * Restores the child subtrees in their corresponding slots.
   */
  _restoreChildNodes(savedChildNodes) {
    for (let i = 0; i < this.childComponents.length; i++) {
      var childComponent = this.childComponents[i];
      var childId = childComponent.getHtmlNodeId();
      if (this._getChildNode(childId) !== null && childId in savedChildNodes) {
        var currentComponentNode = this._getChildNode(childId);
        if (savedChildNodes[childId] != currentComponentNode) {
          currentComponentNode.parentNode.replaceChild(savedChildNodes[childId], currentComponentNode);
        }
      }
    }
  }

  /*
   * Creates and returns an index of child node ids to their current DOM element.
   */
  _saveChildNodes() {
    var savedChildNodes = {};
    for (let i = 0; i < this.childComponents.length; i++) {
      var childComponent = this.childComponents[i];
      var childId = childComponent.getHtmlNodeId();
      if (this._getChildNode(childId) !== null) {
        savedChildNodes[childId] = this._getChildNode(childId);
      }
    }

    return savedChildNodes;
  }

  _getComponentNode() {
    return document.getElementById(this.getHtmlNodeId());
  }

  _getChildNode(childId) {
    return document.getElementById(childId);
  }

  /*
   * Clones a DOM tree, while keeping references from original nodes to their
   * corresponding clones. Moreover, it creates the _nodesWithFrontyComponentAttribute
   * index.
   */
  _cloneAndIndex(root) {
    let clone = root.cloneNode();
    root.realNode = clone;

    if (root.nodeType === Node.ELEMENT_NODE && root.hasAttribute('fronty-component')) {
      this._nodesWithFrontyComponentAttribute.push(root);
    }
    for (let i = 0; i < root.childNodes.length; i++) {
      clone.appendChild(this._cloneAndIndex(root.childNodes[i]));
    }

    return clone;
  }

  /*
   * Creates child nodes dynamically.
   * In addition, it also removes previously created child components whose slots
   * are no longer available.
   */
  _createChildComponents() {

    if (!this.childComponentsByClassName) {
      this.childComponentsByClassName = {};
    }

    // create childs by tag
    this._createTagBasedChildComponents();

    // create childs by fronty-component attribute
    this._createAttributeBasedChildComponents();

    // remove children that have been dynamically created and their slots
    // are no longer present
    this._childrenGC();

  }

  /*
   * Creates components nodes dynamically for elements with the custom tag <ClassName ...>
   */
  _createTagBasedChildComponents() {

    let bufferedParsingService = new Component.BufferedParsingService();
    bufferedParsingService.start();

    for (let i = 0; i < this.childTags.length; i++) {
      let childTag = this.childTags[i];
      if (!this.childComponentsByClassName[childTag]) {
        this.childComponentsByClassName[childTag] = {};
      }
      var childTagElements = Array.from(this._getComponentNode().getElementsByTagName(childTag));

      for (let i = 0; i < childTagElements.length; i++) {
        var childTagElement = childTagElements[i];
        var itemId = childTagElement.getAttribute('id');

        // create component if there is no child component for this id yet
        if (!this.getChildComponent(itemId)) {
          this._createAndAddChildComponent(childTag, childTagElement, itemId, bufferedParsingService);
        }
      }
    }
    bufferedParsingService.finish();
  }

  /*
   * Creates child components dynamically for elements containing the "fronty-component=className"
   * attribute.
   */
  _createAttributeBasedChildComponents() {

    let bufferedParsingService = new Component.BufferedParsingService();
    bufferedParsingService.start();

    if (!this._nodesWithFrontyComponentAttribute) {
      this._nodesWithFrontyComponentAttribute = [];
    }

    for (let j = this._nodesWithFrontyComponentAttribute.length - 1; j >= 0; j--) {
      var node = this._nodesWithFrontyComponentAttribute[j];
      var nodeId = node.getAttribute('id');
      var className = node.getAttribute('fronty-component');

      if (document.getElementById(nodeId) !== null) {

        if (!this.getChildComponent(nodeId)) {
          this._createAndAddChildComponent(className, node, nodeId, bufferedParsingService);
        }
      } else {
        this._nodesWithFrontyComponentAttribute.splice(j, 1);
      }
    }
    bufferedParsingService.finish();
  }

  /* 
   * Cleans remaining children that have disappear (these are tag based childs, fronty-component
   * childs have been deleted just before).
   */
  _childrenGC() {
    var childTags = Object.keys(this.childComponentsByClassName);
    for (let i = 0; i < childTags.length; i++) {
      var childTag = childTags[i];
      var componentIdsInTag = Object.keys(this.childComponentsByClassName[childTag]);
      for (let j = componentIdsInTag.length - 1; j >= 0; j--) {
        var childComponent = this.childComponentsByClassName[childTag][componentIdsInTag[j]];

        if (document.getElementById(childComponent.getHtmlNodeId()) === null) {

          this.removeChildComponent(childComponent);
          delete this.childComponentsByClassName[childTag][childComponent.getHtmlNodeId()];
        }
      }
    }
  }

  /* 
   * Instantiates and indexes a new child component dynamically.
   */
  _createAndAddChildComponent(className, element, id, parsingService) {
    let component = this.createChildComponent(className, element, id);
    if (component) {
      component.setHtmlNodeId(id);
      let prevParsingService = component._parsingService;
      component._parsingService = parsingService;
      this.addChildComponent(component);
      component._parsingService = prevParsingService;

      if (this.childComponentsByClassName[className] === undefined) {
        this.childComponentsByClassName[className] = {};
      }

      this.childComponentsByClassName[className][id] = component;
    }
  }

  // event listeners "private" methods

  // global event listener for this component. All events are dispatched first by
  // this function. If the target of the event matches one of the listener's query
  // indicated in {@link Component#addEventListener}, the
  // event is redirected to the provided callback function.
  _eventsListener(event) {
    for (let i = 0; i < this.eventListeners.length; i++) {
      let listener = this.eventListeners[i];
      if (event.target.matches(listener.query) && listener.eventType === event.type) {
        event.preventDefault();
        listener.callback(event);
        return;
      }
    }
  }

  // place the global event listener in the root of this component
  _updateEventListeners() {
    var rootNode = this._getComponentNode();
    if (rootNode !== null) {
      for (let i = 0; i < this.eventListeners.length; i++) {
        let listener = this.eventListeners[i];
        rootNode.removeEventListener(listener.eventType, this._boundEventsListener);
        rootNode.addEventListener(listener.eventType, this._boundEventsListener);
      }
    }
  }
}

// A simple parsing service that immediately parses the html content and
// calls the callback with the results
Component.ParsingService = class ParsingService {
  parse(htmlContents, callback) {
    var elem = document.createElement('div');
    elem.innerHTML = htmlContents;
    callback(elem.firstChild);
  }
};

// A parsing service that accumulates parsing requests with an associated callback
// to pass the results when available. When the finish() method
// is called, all html received previously is parsed in a row and the corresponding callbacks
// are invoked.
Component.BufferedParsingService = class BufferedParsingService extends Component.ParsingService {
  constructor() {
    super();
    this.currentHTML = '';
    this.counter = 0;
    this.callbacks = [];
  }

  start() {
    this.counter = 0;
    this.currentHTML = '';
    this.callbacks = [];
  }

  finish() {
    if (this.callbacks.length > 0) {
      this.parsedTree = document.createElement('div');
      this.parsedTree.innerHTML = this.currentHTML;

      for (let i = 0; i < this.callbacks.length; i++) {
        var callback = this.callbacks[i];
        callback();
      }
    }
  }

  parse(html, callback) {
    this.currentHTML += '<div>' + html + '</div>';
    var currentCounter = this.counter;
    this.callbacks.push(() => {
      callback(this.parsedTree.childNodes[currentCounter].firstChild);
    });
    this.counter++;
  }

};

Component._defaultParsingService = new Component.ParsingService();


/*********** DOM TREE DIFF & PATCH *******/
/**
 * A class to do discover differences between two DOM trees, calculating a
 * <em>patch</em>, as well as to reconcile those differences by applying the
 * <em>patch</em>
 */
class TreeComparator {

  /**
   * Compute the difference between two DOM trees, giving their root nodes.<br>
   *
   * The resulting object is a <em>patch</em> object that can be used to 
   * keep the first given tree equivalent to the second given tree.<br>
   *
   * An optional function can be provided to control how different subtrees are
   * compared. This function receives two nodes (node1, node2) and can return:
   * <ul>
   * <li>TreeComparator.COMPARE_POLICY_DIFF: The comparison should be done as normal.</li>
   * <li>TreeComparator.COMPARE_POLICY_SKIP: The comparison should not go deeper.</li>
   * <li>TreeComparator.COMPARE_POLICY_REPLACE: The node1 should be totally replaced by the node2,
   * without going deeper</li>
   * </ul>
   * @param {Node} node1 The root element of the first tree to compare.
   * @param {Node} node2 The root element of the second tree to compare.
   * @param {Function} [comparePolicy] An (optional) callback function to be called
   * before comparing subnodes.
   */
  static diff(node1, node2, comparePolicy) {
    if (comparePolicy) {
      var actionToDo = comparePolicy(node1, node2);
      if (actionToDo === TreeComparator.COMPARE_POLICY_SKIP) {
        return [];
      } else if (actionToDo === TreeComparator.COMPARE_POLICY_REPLACE) {
        return [{
          mode: TreeComparator.PATCH_REPLACE_NODE,
          toReplace: node1,
          replacement: node2
        }];
      } //otherwise, i.e.: TreeComparator.COMPARE_POLICY_DIFF, do nothing
    }

    var result = [];

    if (node1 !== null && node1.tagName === node2.tagName && node1.nodeType === node2.nodeType) {
      // equal tagName and nodeType, compare children...
      if (node1.childNodes.length > 0 || node2.childNodes.length > 0) {
        TreeComparator._compareChildren(node1, node2, comparePolicy, result);
      }
    } else {
      // different tagName, nodeType, complete replacement
      return [{
        mode: TreeComparator.PATCH_REPLACE_NODE,
        toReplace: node1,
        replacement: node2
      }];
    }

    if (
      (node1.nodeType === Node.TEXT_NODE || node1.nodeType === Node.COMMENT_NODE) &&
      node1.nodeValue !== null &&
      node2.nodeValue !== null &&
      node1.nodeValue !== node2.nodeValue
    ) {
      // for text and comment nodes, we compare their nodeValue. Text nodes and
      // comment nodes have no chidren, so we return immediately.
      return [{
        mode: TreeComparator.PATCH_SET_NODE_VALUE,
        toReplace: node1,
        replacement: node2
      }];
    }
    
    if (!TreeComparator._equalAttributes(node1, node2)) {
      // if there are some differences in attributtes, add this patch also.
      result.push({
        mode: TreeComparator.PATCH_SET_ATTRIBUTES,
        toReplace: node1,
        replacement: node2
      });
    }
    return result;
  }

  static _compareChildren(node1, node2, comparePolicy, result) {

    let child1pos = 0;
    let child2pos = 0;
    let insertions = 0;
    let deletions = 0;

    // create a copy-on-write array for node1.childNodes. We will keep track
    // of the performed swap operations without modifying the original node1.childNodes
    let node1ChildNodes = [];

    let node1Keys = TreeComparator._buildChildrenKeyIndex(node1);
    let node2Keys = TreeComparator._buildChildrenKeyIndex(node2);

    while (child1pos < node1.childNodes.length && child2pos < node2.childNodes.length) {
      let child1 = node1ChildNodes[child1pos] ? node1ChildNodes[child1pos] : node1.childNodes[child1pos];
      let child2 = node2.childNodes[child2pos];

      if (child1.nodeType === Node.ELEMENT_NODE && child2.nodeType === Node.ELEMENT_NODE) {
        let key1 = child1.getAttribute('key'); // maybe null (no-key)
        let key2 = child2.getAttribute('key'); // maybe null (no-key)

        if (key1 !== key2) {
          if ((key1 in node2Keys) && (key2 in node1Keys)) {

            //both nodes are in the initial and final result, so we only need to swap them
            result.push({
              mode: TreeComparator.PATCH_SWAP_NODES,
              toReplace: child1,
              replacement: node1.childNodes[node1Keys[key2].pos]
            });

            // swap elements in the node1ChildNodes
            var temp = node1ChildNodes[child1pos] ? node1ChildNodes[child1pos] : node1.childNodes[child1pos];
            node1ChildNodes[child1pos] = node1ChildNodes[node1Keys[key2].pos] ? node1ChildNodes[node1Keys[key2].pos] : node1.childNodes[node1Keys[key2].pos];
            node1ChildNodes[node1Keys[key2].pos] = temp;

          } else {
            //both nodes are NOT in the initial and final result
            if (!(key2 in node1Keys)) {
              // if a key element in the new result is missing in the current tree, we should insert it
              result.push({
                mode: TreeComparator.PATCH_INSERT_NODE,
                toReplace: node1,
                replacement: child2,
                beforePos: child1pos + insertions - deletions
              });
              insertions++;
              child2pos++;

            }
            // and if a key element in the current result is missing in the new result, we should remove it
            if (!(key1 in node2Keys)) {
              result.push({
                mode: TreeComparator.PATCH_REMOVE_NODE,
                toReplace: child1
              });
              child1pos++;
              deletions++;

            }
          }

        } else {
          // both keys are equals (same key OR both null)
          result.push.apply(result, TreeComparator.diff(
            child1,
            child2,
            comparePolicy));

          child1pos++;
          child2pos++;
        }
      } else if (child1.nodeType !== Node.ELEMENT_NODE && child2.nodeType === Node.ELEMENT_NODE) {
        // "strange" non-element nodes on current tree are removed
        result.push({
          mode: TreeComparator.PATCH_REMOVE_NODE,
          toReplace: child1
        });
        child1pos++;
        deletions++;
      } else if (child1.nodeType === Node.ELEMENT_NODE && child2.nodeType !== Node.ELEMENT_NODE) {
        // new non-element nodes on new tree are inserted
        result.push({
          mode: TreeComparator.PATCH_INSERT_NODE,
          toReplace: node1,
          replacement: child2,
          beforePos: child1pos + insertions - deletions
        });
        insertions++;
        child2pos++;
        
      } else if (child1.nodeType !== Node.ELEMENT_NODE && child2.nodeType !== Node.ELEMENT_NODE) {
        // both non-element nodes are compared
        var partial =
          TreeComparator.diff(
            child1,
            child2,
            comparePolicy);
        result.push.apply(result, partial);

        child1pos++;
        child2pos++;
      }
    }

    if (child1pos < node1.childNodes.length) {
      for (let i = child1pos; i < node1.childNodes.length; i++) {
        result.push({
          mode: TreeComparator.PATCH_REMOVE_NODE,
          toReplace: node1.childNodes[i]
        });
      }
    } else if (child2pos < node2.childNodes.length) {
      for (let j = child2pos; j < node2.childNodes.length; j++) {
        result.push({
          mode: TreeComparator.PATCH_APPEND_CHILD,
          toReplace: node1,
          replacement: node2.childNodes[j]
        });
      }
    }
  }

  static _swapArrayElements(arr, indexA, indexB) {
    var temp = arr[indexA];
    arr[indexA] = arr[indexB];
    arr[indexB] = temp;
  }

  static _buildChildrenKeyIndex(node) {
    let index = {};
    let childpos = -1;
    for (let i = 0; i < node.childNodes.length; i++) {
      let child = node.childNodes[i];
      childpos++;
      if (child.nodeType === Node.ELEMENT_NODE) {
        let key = child.getAttribute('key');
        if (key) {
          index[key] = {
            node: child,
            pos: childpos
          };
        }
      }
    }
    return index;
  }

  static _equalAttributes(node1, node2) {
    if (!node1.attributes && !node2.attributes) {
      return true;
    }

    if (!node1.attributes && node2.attributes ||
      node1.attributes && !node2.attributes) {
      return false;
    }

    //TODO: receive this id as paremeter

    if (node1.attributes.length !== node2.attributes.length) {
      return false;
    }

    for (let i = 0; i < node1.attributes.length; i++) {
      if (node1.attributes[i].name != node2.attributes[i].name ||
        node1.attributes[i].value != node2.attributes[i].value) {
        return false;
      }
    }

    return true;
  }

  static _swapElements(obj1, obj2) {
    var temp = document.createElement("div");
    obj1.parentNode.insertBefore(temp, obj1);
    obj2.parentNode.insertBefore(obj1, obj2);
    temp.parentNode.insertBefore(obj2, temp);
    temp.parentNode.removeChild(temp);
  }

  /**
   * Applies the patches to the current DOM.
   *
   * @param patches Patches previously computed with {@link TreeComparator.diff}
   */
  static applyPatches(patches, patchMapping) {
    for (let i = 0; i < patches.length; i++) {
      var patch = patches[i];
      if (patchMapping !== undefined) {
        patch = patchMapping(patch);
      }
      // HTML nodes
      var toReplace = patch.toReplace;
      var replacement = patch.replacement;
      switch (patch.mode) {
        case TreeComparator.PATCH_SET_ATTRIBUTES:
          var attribute = null;
          for (let i = 0; i < replacement.attributes.length; i++) {
            attribute = replacement.attributes[i];
            if (attribute.name === 'value' &&
              toReplace.value != attribute.value) {
              toReplace.value = attribute.value;
            }
            if (attribute.name === 'checked') {
              toReplace.checked =
                (attribute.checked !== false) ? true : false;
            }
            toReplace.setAttribute(attribute.name, attribute.value);
          }

          for (let j = toReplace.attributes.length - 1; j >= 0; j--) {
            attribute = patch.toReplace.attributes[j];
            if (!replacement.hasAttribute(attribute.name)) {
              if (attribute.name === 'checked') {
                toReplace.checked = false;
              }
              toReplace.removeAttribute(attribute.name);
            }
          }
          break;
        case TreeComparator.PATCH_SET_NODE_VALUE:
          patch.toReplace.nodeValue = patch.replacement.nodeValue;

          break;
        case TreeComparator.PATCH_REMOVE_NODE:
          patch.toReplace.parentNode.removeChild(patch.toReplace);
          break;
        case TreeComparator.PATCH_APPEND_CHILD:
          patch.toReplace.appendChild(patch.replacement);
          break;
        case TreeComparator.PATCH_INSERT_NODE:
          if (patch.toReplace.childNodes.length === 0) {
            patch.toReplace.appendChild(patch.replacement);
          } else {
            patch.toReplace.insertBefore(patch.replacement, patch.toReplace.childNodes[patch.beforePos]);
          }
          break;
        case TreeComparator.PATCH_SWAP_NODES:
          TreeComparator._swapElements(patch.toReplace, patch.replacement);
          break;
        case TreeComparator.PATCH_REPLACE_NODE:
          toReplace.parentNode.replaceChild(replacement, toReplace);
      }
    }
  }
}
TreeComparator.PATCH_INSERT_NODE = 0;
TreeComparator.PATCH_REMOVE_NODE = 1;
TreeComparator.PATCH_SWAP_NODES = 2;
TreeComparator.PATCH_APPEND_CHILD = 3;
TreeComparator.PATCH_REPLACE_NODE = 4;
TreeComparator.PATCH_SET_NODE_VALUE = 5;
TreeComparator.PATCH_SET_ATTRIBUTES = 6;

TreeComparator.COMPARE_POLICY_SKIP = 0;
TreeComparator.COMPARE_POLICY_REPLACE = 1;
TreeComparator.COMPARE_POLICY_DIFF = 2;
/**
 * A Model is a general-purpose, observable object, holding user specific data.
 *
 *  The object can receive <em>observer functions</em> (via 
 * {@link Model#addObserver|addObserver()} function), which will be notified
 *  when the {@link Model#set|set( callback )} method of this object is called.
 *
 */
class Model {

  /**
   * Creates an instance of a Model.
   *
   * @param {String} [name=--unnamed model--] A name for the model
   */
  constructor(name) {
    /**
     * The set of observer functions to be called when this Model is changed
     * via {@link Model#set|set()} method.
     */
    this.observers = [];

    /**
     * The name of the model.
     * @type {String}
     */
    this.name = name ? name : '--unnamed model--';
  }

  /**
   * Method to update the this Model.<br>
   * A callback function is passed which is, typically, in charge to make changes 
   * in this object. When this callback returns, observers of this Model are
   * notified.
   * @example
   *  Model m = new Model('mymodel');
   *  m.set( () => { m.itemName='Tablet'; m.price=1200});
   * 
   * @param {Function} update The callback function in charge of changing this 
   *        Model. The function will receive the reference to this Model as 
   *        parameter.
   * @param {Object} [hint] Any additional object to be passed to
   *         {@link Model#observers|observers} during notification.
   */
  set(update, hint) {
    update(this);
    this.notifyObservers(hint);
  }

  /**
   * Invokes all {@link Model#observers|observers}.
   *
   * @param {Object} [hint] An optional object to pass as argument to observers.
   */
  notifyObservers(hint) {
    for (let i = 0; i < this.observers.length; i++) {
      let observer = this.observers[i];
      observer(this, hint);
    }
  }

  /**
   * Adds an observer function to this Model.<br>
   * 
   * @param {Function} observer The observer to add.
   * @see {@link Model#observers}
   */
  addObserver(observer) {
    this.observers.push(observer);
    console.log('Model [' + this.name + ']: added observer, total: ' + this.observers.length);
  }

  /**
   * Removes an observer function from this Model.<br>
   *
   * The function will no longer be notified of changes in this Model.
   *
   * @param {Function} observer The observer to be removed.
   */
  removeObserver(observer) {
    if (this.observers.indexOf(observer) != -1) {
      this.observers.splice(this.observers.indexOf(observer), 1);
      console.log('Model [' + this.name + ']: removed observer, total: ' + this.observers.length);
    }
  }
}


/** 
 * Class representing a model-based Component.<br>
 *
 * A ModelComponent is a Component which <em>auto-renders</em> itself when a
 * given {@link Model|model} object changes. This model object is also passed to this
 * Component's {@link Component#renderer|renderer function} each time this
 * Component is rendered.
 *
 * @example
 * <!-- html page -->
 * <body>
 *  <div id="mycomponent"></div>
 * </body>
 *
 * @example
 * // Javascript
 * // Model
 * var model = new Model();
 * model.counter = 0;
 *
 * // The ModelComponent to render the Model
 * var component = new ModelComponent(
 *  (m) => '<div>Counter: <span>'+m.counter+'</span></div>', // renderer function
 *  model, //the model
 *  'mycomponent' // HTML element id
 *  );
 *
 * component.start(); // first render
 *
 * // Make changes in Model to fire re-renders
 * setInterval(() => {
 *    model.set( () => model.counter++); // model update -> automatic re-render!
 * }, 1000);
 * @extends Component
 */
class ModelComponent extends Component {

  /**
   * Creates a new ModelComponent.
   *
   * @param {Function} modelRenderer A renderer function which accepts a
   * {@link Model} as argument.
   * @param {Model|Array.<Model>} model The model or an array of models. In case of
   * an array is passed, the renderer function will receive a single model object
   * which combines all the properties of those models.
   * @param {String} htmlNodeId The id of the HTML element where this Component should 
   *                              render to.
   * @param {Array.<String>} [childTags] An optional Array of strings of custom-tags for dynamically created child Components.
   */
  constructor(modelRenderer, model, htmlNodeId, childTags) {
    super(
      // the renderer function wraps the modelRenderer function in order to
      // pass the model to the modelRenderer.
      () => {
        return modelRenderer(this._mergeModelInOneObject());
      },
      htmlNodeId, childTags
    );

    if (!model) {
      /**
       * The models this ModelComponent is handling
       * @type {Array.<Model>}
       */
      this.models = [];
    } else if (model instanceof Model) {
      this.models = [model];
    } else if (model instanceof Array) {

      for (let i = 0; i < model.length; i++) {
        let modelItem = model[i];
        if (!(modelItem instanceof Model)) {
          throw 'Component [' + this.htmlNodeId + ']: the model must inherit Model';
        }
      }

      this.models = model;
    } else {
      throw 'Component [' + this.htmlNodeId + ']: the model must inherit Model';
    }

    this.updater = this.update.bind(this); // the update function bound to this
  }

  /**
   * The observer function added to all models this ModelComponent manages.<br>
   * This function simply calls {@link ModelComponent#render|render}, but
   * you can override it.
   *
   * @param {Model} model The model that has been updated.
   */
  update(model) {
    console.log('Component [#' + this.htmlNodeId + ']: received update from Model [' + model.name + ']');
    this.render();
  }

  // lifecycle management
  stop() {

    if (this.stopped === false) {
      for (let i = 0; i < this.models.length; i++) {
        let model = this.models[i];
        model.removeObserver(this.updater);
      }
    }
    super.stop();
  }

  start() {
    if (this.stopped) {
      for (let i = 0; i < this.models.length; i++) {
        let model = this.models[i];
        model.addObserver(this.updater);
      }
    }
    super.start();
  }

  _mergeModelInOneObject() {
    var context = {};
    for (let i = 0; i < this.models.length; i++) {
      let model = this.models[i];
      context = Object.assign(context, model);
    }
    return context;
  }

  /** 
   * Overrides the child Component creation by also considering a "model"
   * attribute in the tag.<br>
   * The model attribute is used as a path inside the model object and calls 
   * {@link ModelComponent#createChildModelComponent}.
   * @example
   * <!-- How to add a model attribute in the HTML child tag -->
   * <childcomponent id="child-0" model="items[0]">
   *
   * @param {String} tagName The HTML tag name used to place the new child Component
   * in the parent HTML
   * @param {Node} childTagElement The HTML element where the new Child will be placed
   * @param {String} id The HTML id found in the tag.
   * @return {Component} The new created child Component.
   * @see {@link Component#childTags}
   */
  createChildComponent(className, element, id) {
    let oneModelObject = this._mergeModelInOneObject();

    let modelAtt = element.getAttribute('model');
    let modelItem = null;
    if (modelAtt.indexOf('(') === -1) {
      // for simple expressions, do not use eval (slower)
      // navigate the object graph manually
      modelItem = oneModelObject;
      let arr = modelAtt.split(/[.\[\]]/);
      while (arr.length) {
        let elem = arr.shift();
        if (elem.length !== 0) {
          modelItem = modelItem[elem];
        }
      }

    } else {
      // complex including (), use eval
      modelItem = eval('oneModelObject.' + element.getAttribute('model')); //jshint ignore:line
    }
    return this.createChildModelComponent(className, element, id, modelItem);
  }

  /**
   * This method searches for a class with the name of the className parameter
   * with a constructor taking two attributes: id and model.<br>
   * If you have components with different constructors or this policy does not
   * adapt to your needs, you can override this method.
   *
   * @param {String} className The class name found in the element
   * @param {Node} element The HTML element where the new child will be placed
   * @param {String} id The HTML id found in the element.
   * @param {Object} modelItem a model object for the new Component.
   * @return {Component} The new created child component.
   */
  createChildModelComponent(className, element, id, modelItem) {
    var constructorFunction = eval('' + className); //jshint ignore:line

    if (constructorFunction instanceof Function) {
      return new constructorFunction(id, modelItem);
    }
  }
}

/**
 *  Class representing a router component.<br>
 *  
 *  A router is reponsible of parsing the current browser location 
 *  mapping its current hash to "pages". Each time the location is
 *  changed, the router tries to replace the inner HTML in a given html node id
 *  element.Pages are:
 * <ol>
 *    <li>A Component, which will render the page contents.</li>
 *    <li>Some other options, such as title.</li>
 *  </ol>
 *  You have to define your by calling {@link RouterComponent#setRouterConfig}.<br>
 *  Finally, calling start() will try to go to the page indicated by the hash, rendering
 *  its contents.<br>
 *  The RouterComponent is a {@link ModelComponent} because it has an own Model
 *  containing the "currentPage" property.
 *
 * @example
 * var router = new RouterComponent(
 *      // id of the HTML element where router renders.
 *      'router', 
 *      //HTML of the router.
 *      () => "<div id='router'><div id='maincontent'></div></div>", 
 *      // id inside the router where the current page component renders.
 *      'maincontent'); 
 * router.setRouterConfig(
 * {    
 *    login: { //rendered on http://<host>/<page>.html#login
 *      component: new LoginComponent(), // LoginComponent is a Component
 *      title: 'Login'
 *    },
 *    // more pages
 *    defaultRoute: 'login'
 * });
 * router.start();
 *
 * @extends ModelComponent
 */
class RouterComponent extends ModelComponent {

  /**
   * Creates a new router.<br>
   * 
   * @param {String} rootHtmlId The HTML element id where the router renders.
   * @param {Function} modelRenderer the model renderer function
   */
  constructor(rootHtmlId, modelRenderer, routeContentsHtmlId, model) {

    // add a routerModel to the given model(s), creating an array
    var routerModel = new Model('RouterModel');

    if (model instanceof Array) {
      model.push(routerModel);
    } else if (model !== null && model !== undefined) {
      model = [routerModel, model];
    } else {
      model = routerModel;
    }

    super(modelRenderer, model, rootHtmlId);

    this._routerModel = routerModel;
    this.routes = {};

    this._routerModel.currentPage = this._calculateCurrentPage();

    this.pageHtmlId = routeContentsHtmlId;

    window.addEventListener('hashchange', () => {
      console.log("Router: page changed");
      this._routerModel.set(() => {
        this._routerModel.currentPage = this._calculateCurrentPage();
      });
    });
  }

  /**
   * This function overrides the {@link ModelComponent#update}, by also 
   * checking if the model being changed is this RouterComponent's model. In
   * such a case, the RouterComponent goes to the page the model indicates.
   *
   * @param {Model} model The model that has been updated.
   */
  update(model) {
    super.update(model);
    if (model == this._routerModel) {
      this._goToCurrentPage();
    }
  }

  /**
   * Sets the router configuration. This configuration basically maps
   * URL hashes to Components that should be showed.
   *
   * @param {Object.<String, {component: Component, title: String}>}
   * routerConfig Mapping of URL hashes to pages.
   * 
   * @example
   * router.setRouterConfig(
   * {    
   *    login: { //rendered on http://<host>/<page>.html#login
   *      component: new LoginComponent(), // LoginComponent is a Component
   *      title: 'Login'
   *    },
   *    // more pages
   *    defaultRoute: 'login'
   * });
   */
  setRouterConfig(routerConfig) {
    this.routes = routerConfig;
    this._routerModel.currentPage = this._calculateCurrentPage();
  }

  onStart() {
    this._goToCurrentPage();
  }

  /**
   * Displays to an specified page. Pages are defined in 
   * {@link RouterComponent#setRouterConfig}
   *
   * @param {String} route The route to go. Example: 'login'
   */
  goToPage(route) {
    window.location.hash = '#' + route;
  }

  /**
   * Gets the current page being shown.
   * @return {String} The current page.
   */
  getCurrentPage() {
    return this._routerModel.currentPage;
  }

  /**
   * Gets this the model of this router.<br>
   *
   * The router contains an internal model where the current page is stored 
   * (among those models provided in the constructor). You can obtain this
   * internal model by calling this function.
   *
   * @return {Model} The model of this router.
   */
  getRouterModel() {
    return this._routerModel;
  }

  /**
   * Gets a query parameter of the current route.<br>
   *
   * Note: <em>route query parameters</em> are NOT the standard URL query
   * parameters, which are specified BEFORE the hash.<br>
   *
   * For example, if the current URL is 'index.html#login?q=1',
   * a call to getRouteQueryParam('q') returns 1.
   *
   * @param {String} name The name of the route query parameter.
   * @return The value of the router query parameter.
   */
  getRouteQueryParam(name) {
    var queryString = window.location.hash.replace(/#[^\?]*(\?.*)/, "$1");
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(queryString);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  _calculateCurrentPage() {
    var currentPage = window.location.hash.replace(/#([^\\?]*).*/, "$1");
    if (currentPage.length === 0 && this.routes.defaultRoute) {
      currentPage = this.routes.defaultRoute;
    }
    return currentPage;

  }
  _goToCurrentPage() {
    var currentPage = this.getCurrentPage();

    if (currentPage) {

      // get page component and update the main body element
      if (currentPage in this.routes) {
        if (this.routes[currentPage].title) {
          document.title = this.routes[currentPage].title;
        }

        // stop the previous component
        if (this.currentComponent) {
          this.currentComponent.stop();
        }
        this.removeChildComponent(this.currentComponent);

        // start the new page's component
        this.currentComponent = this.routes[currentPage].component;
        this.currentComponent.setHtmlNodeId(this.pageHtmlId);

        this.addChildComponent(this.currentComponent);
        this.routes[currentPage].component.start();

      } else {
        console.log('Router undefined page ' + currentPage);
      }
    } else {
      console.log('Router: no default page defined');
    }
  }
}
