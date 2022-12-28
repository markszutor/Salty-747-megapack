/**
 * Types of subscribable array change event.
 */
var SubscribableArrayEventType;
(function (SubscribableArrayEventType) {
    /** An element was added. */
    SubscribableArrayEventType["Added"] = "Added";
    /** An element was removed. */
    SubscribableArrayEventType["Removed"] = "Removed";
    /** The array was cleared. */
    SubscribableArrayEventType["Cleared"] = "Cleared";
})(SubscribableArrayEventType || (SubscribableArrayEventType = {}));
/**
 * An abstract implementation of a subscribable which allows adding, removing, and notifying subscribers.
 */
class AbstractSubscribable {
    constructor() {
        this.subs = [];
    }
    /** @inheritdoc */
    sub(fn, initialNotify) {
        this.subs.push(fn);
        if (initialNotify) {
            fn(this.get());
        }
    }
    /** @inheritdoc */
    unsub(fn) {
        const index = this.subs.indexOf(fn);
        if (index >= 0) {
            this.subs.splice(index, 1);
        }
    }
    /**
     * Notifies subscribers that this subscribable's value has changed.
     */
    notify() {
        const subLen = this.subs.length;
        for (let i = 0; i < subLen; i++) {
            try {
                this.subs[i](this.get());
            }
            catch (error) {
                console.error(`AbstractSubscribable: error in handler: ${error}`);
                if (error instanceof Error) {
                    console.error(error.stack);
                }
            }
        }
    }
}
/**
 * Checks if two values are equal using the strict equality operator.
 * @param a The first value.
 * @param b The second value.
 * @returns whether a and b are equal.
 */
AbstractSubscribable.DEFAULT_EQUALITY_FUNC = (a, b) => a === b;

/**
 * A subscribable subject whose value can be freely manipulated.
 */
class Subject extends AbstractSubscribable {
    /**
     * Constructs an observable Subject.
     * @param value The initial value.
     * @param equalityFunc The function to use to check for equality.
     * @param mutateFunc The function to use to mutate the subject's value.
     */
    constructor(value, equalityFunc, mutateFunc) {
        super();
        this.value = value;
        this.equalityFunc = equalityFunc;
        this.mutateFunc = mutateFunc;
    }
    /**
     * Creates and returns a new Subject.
     * @param v The initial value of the subject.
     * @param equalityFunc The function to use to check for equality between subject values. Defaults to the strict
     * equality comparison (`===`).
     * @param mutateFunc The function to use to change the subject's value. If not defined, new values will replace
     * old values by variable assignment.
     * @returns A Subject instance.
     */
    static create(v, equalityFunc, mutateFunc) {
        return new Subject(v, equalityFunc !== null && equalityFunc !== void 0 ? equalityFunc : Subject.DEFAULT_EQUALITY_FUNC, mutateFunc);
    }
    /**
     * Sets the value of this subject and notifies subscribers if the value changed.
     * @param value The new value.
     */
    set(value) {
        if (!this.equalityFunc(value, this.value)) {
            if (this.mutateFunc) {
                this.mutateFunc(this.value, value);
            }
            else {
                this.value = value;
            }
            this.notify();
        }
    }
    /**
     * Applies a partial set of properties to this subject's value and notifies subscribers if the value changed as a
     * result.
     * @param value The properties to apply.
     */
    apply(value) {
        let changed = false;
        for (const prop in value) {
            changed = value[prop] !== this.value[prop];
            if (changed) {
                break;
            }
        }
        Object.assign(this.value, value);
        changed && this.notify();
    }
    /** @inheritdoc */
    notify() {
        super.notify();
    }
    /**
     * Gets the value of this subject.
     * @returns The value of this subject.
     */
    get() {
        return this.value;
    }
    // eslint-disable-next-line jsdoc/require-jsdoc
    map(fn, equalityFunc, mutateFunc, initialVal) {
        const mapFunc = (inputs, previousVal) => fn(inputs[0], previousVal);
        return mutateFunc
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ? MappedSubject.create(mapFunc, equalityFunc, mutateFunc, initialVal, this)
            : MappedSubject.create(mapFunc, equalityFunc !== null && equalityFunc !== void 0 ? equalityFunc : AbstractSubscribable.DEFAULT_EQUALITY_FUNC, this);
    }
}
/**
 * A subscribable subject that is a mapped stream from one or more input subscribables.
 */
class MappedSubject extends AbstractSubscribable {
    /**
     * Creates a new MappedSubject.
     * @param mapFunc The function which maps this subject's inputs to a value.
     * @param equalityFunc The function which this subject uses to check for equality between values.
     * @param mutateFunc The function which this subject uses to change its value.
     * @param initialVal The initial value of this subject.
     * @param inputs The subscribables which provide the inputs to this subject.
     */
    constructor(mapFunc, equalityFunc, mutateFunc, initialVal, ...inputs) {
        super();
        this.mapFunc = mapFunc;
        this.equalityFunc = equalityFunc;
        this.inputs = inputs;
        this.inputValues = inputs.map(input => input.get());
        if (initialVal && mutateFunc) {
            this.value = initialVal;
            mutateFunc(this.value, this.mapFunc(this.inputValues));
            this.mutateFunc = (newVal) => { mutateFunc(this.value, newVal); };
        }
        else {
            this.value = this.mapFunc(this.inputValues);
            this.mutateFunc = (newVal) => { this.value = newVal; };
        }
        this.inputHandlers = this.inputs.map((input, index) => this.updateValue.bind(this, index));
        for (let i = 0; i < inputs.length; i++) {
            inputs[i].sub(this.inputHandlers[i]);
        }
    }
    // eslint-disable-next-line jsdoc/require-jsdoc
    static create(mapFunc, ...args) {
        let equalityFunc, mutateFunc, initialVal;
        if (typeof args[0] === 'function') {
            equalityFunc = args.shift();
        }
        else {
            equalityFunc = MappedSubject.DEFAULT_EQUALITY_FUNC;
        }
        if (typeof args[0] === 'function') {
            mutateFunc = args.shift();
            initialVal = args.shift();
        }
        return new MappedSubject(mapFunc, equalityFunc, mutateFunc, initialVal, ...args);
    }
    /**
     * Updates an input value, then re-maps this subject's value, and notifies subscribers if this results in a change to
     * the mapped value according to this subject's equality function.
     * @param index The index of the input value to update.
     */
    updateValue(index) {
        this.inputValues[index] = this.inputs[index].get();
        const value = this.mapFunc(this.inputValues, this.value);
        if (!this.equalityFunc(this.value, value)) {
            this.mutateFunc(value);
            this.notify();
        }
    }
    /**
     * Gets the current value of the subject.
     * @returns The current value.
     */
    get() {
        return this.value;
    }
    /**
     * Destroys the subscription to the parent subscribable.
     */
    destroy() {
        for (let i = 0; i < this.inputs.length; i++) {
            this.inputs[i].unsub(this.inputHandlers[i]);
        }
    }
    // eslint-disable-next-line jsdoc/require-jsdoc
    map(fn, equalityFunc, mutateFunc, initialVal) {
        const mapFunc = (inputs, previousVal) => fn(inputs[0], previousVal);
        return new MappedSubject(mapFunc, equalityFunc !== null && equalityFunc !== void 0 ? equalityFunc : MappedSubject.DEFAULT_EQUALITY_FUNC, mutateFunc, initialVal, this);
    }
}

/**
 * A class for subjects that return a computed value.
 * @class ComputedSubject
 * @template I The type of the input value.
 * @template T The type of the computed output value.
 */
class ComputedSubject {
    /**
     * Creates an instance of ComputedSubject.
     * @param value The initial value.
     * @param computeFn The computation function.
     */
    constructor(value, computeFn) {
        this.computeFn = computeFn;
        this._subs = [];
        this._value = value;
        this._computedValue = computeFn(value);
    }
    /**
     * Creates and returns a new ComputedSubject.
     * @param v The initial value of the Subject.
     * @param fn A function which transforms raw values to computed values.
     * @returns A ComputedSubject instance.
     */
    static create(v, fn) {
        return new ComputedSubject(v, fn);
    }
    /**
     * Sets the new value and notifies the subscribers when value changed.
     * @param value The new value.
     */
    set(value) {
        this._value = value;
        const compValue = this.computeFn(value);
        if (compValue !== this._computedValue) {
            this._computedValue = compValue;
            const subLen = this._subs.length;
            for (let i = 0; i < subLen; i++) {
                this._subs[i](this._computedValue, this._value);
            }
        }
    }
    /**
     * Gets the computed value of the Subject.
     * @returns The computed value.
     */
    get() {
        return this._computedValue;
    }
    /**
     * Gets the raw value of the Subject.
     * @returns The raw value.
     */
    getRaw() {
        return this._value;
    }
    /**
     * Subscribes to the subject with a callback function. The function will be called whenever the computed value of
     * this Subject changes.
     * @param fn A callback function.
     * @param initialNotify Whether to immediately notify the callback function with the current compured and raw values
     * of this Subject after it is subscribed. False by default.
     */
    sub(fn, initialNotify) {
        this._subs.push(fn);
        if (initialNotify) {
            fn(this._computedValue, this._value);
        }
    }
    /**
     * Unsubscribes a callback function from this Subject.
     * @param fn The callback function to unsubscribe.
     */
    unsub(fn) {
        const index = this._subs.indexOf(fn);
        if (index >= 0) {
            this._subs.splice(index, 1);
        }
    }
    // eslint-disable-next-line jsdoc/require-jsdoc
    map(fn, equalityFunc, mutateFunc, initialVal) {
        const mapFunc = (inputs, previousVal) => fn(inputs[0], previousVal);
        return mutateFunc
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ? MappedSubject.create(mapFunc, equalityFunc, mutateFunc, initialVal, this)
            : MappedSubject.create(mapFunc, equalityFunc !== null && equalityFunc !== void 0 ? equalityFunc : AbstractSubscribable.DEFAULT_EQUALITY_FUNC, this);
    }
}

/* eslint-disable no-inner-declarations */
/** A releative render position. */
var RenderPosition;
(function (RenderPosition) {
    RenderPosition[RenderPosition["Before"] = 0] = "Before";
    RenderPosition[RenderPosition["After"] = 1] = "After";
    RenderPosition[RenderPosition["In"] = 2] = "In";
})(RenderPosition || (RenderPosition = {}));
/**
 * A display component in the component framework.
 * @typedef P The type of properties for this component.
 * @typedef C The type of context that this component might have.
 */
class DisplayComponent {
    /**
     * Creates an instance of a DisplayComponent.
     * @param props The propertis of the component.
     */
    constructor(props) {
        /** The context on this component, if any. */
        this.context = undefined;
        /** The type of context for this component, if any. */
        this.contextType = undefined;
        this.props = props;
    }
    /**
     * A callback that is called before the component is rendered.
     */
    onBeforeRender() { return; }
    /**
     * A callback that is called after the component is rendered.
     * @param node The component's VNode.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onAfterRender(node) { return; }
    /**
     * Destroys this component.
     */
    destroy() { return; }
    /**
     * Gets a context data subscription from the context collection.
     * @param context The context to get the subscription for.
     * @returns The requested context.
     * @throws An error if no data for the specified context type could be found.
     */
    getContext(context) {
        if (this.context !== undefined && this.contextType !== undefined) {
            const index = this.contextType.indexOf(context);
            return this.context[index];
        }
        throw new Error('Could not find the provided context type.');
    }
}
/**
 * A reference to a component or element node.
 */
class NodeReference {
    constructor() {
        /** The internal reference instance. */
        this._instance = null;
    }
    /**
     * The instance of the element or component.
     * @returns The instance of the element or component.
     */
    get instance() {
        if (this._instance !== null) {
            return this._instance;
        }
        throw new Error('Instance was null.');
    }
    /**
     * Sets the value of the instance.
     */
    set instance(val) {
        this._instance = val;
    }
    /**
     * Gets the instance, or null if the instance is not populated.
     * @returns The component or element instance.
     */
    getOrDefault() {
        return this._instance;
    }
}
/**
 * Provides a context of data that can be passed down to child components via a provider.
 */
class Context {
    /**
     * Creates an instance of a Context.
     * @param defaultValue The default value of this context.
     */
    constructor(defaultValue) {
        this.defaultValue = defaultValue;
        /**
         * The provider component that can be set to a specific context value.
         * @param props The props of the provider component.
         * @returns A new context provider.
         */
        this.Provider = (props) => new ContextProvider(props, this);
    }
}
/**
 * A provider component that can be set to a specific context value.
 */
class ContextProvider extends DisplayComponent {
    /**
     * Creates an instance of a ContextProvider.
     * @param props The props on the component.
     * @param parent The parent context instance for this provider.
     */
    constructor(props, parent) {
        super(props);
        this.parent = parent;
    }
    /** @inheritdoc */
    render() {
        var _a;
        const children = (_a = this.props.children) !== null && _a !== void 0 ? _a : [];
        return FSComponent.buildComponent(FSComponent.Fragment, this.props, ...children);
    }
}
/**
 * The FS component namespace.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
var FSComponent;
(function (FSComponent) {
    /**
     * Valid SVG element tags.
     */
    const svgTags = {
        'circle': true,
        'clipPath': true,
        'color-profile': true,
        'cursor': true,
        'defs': true,
        'desc': true,
        'ellipse': true,
        'g': true,
        'image': true,
        'line': true,
        'linearGradient': true,
        'marker': true,
        'mask': true,
        'path': true,
        'pattern': true,
        'polygon': true,
        'polyline': true,
        'radialGradient': true,
        'rect': true,
        'stop': true,
        'svg': true,
        'text': true
    };
    /**
     * A fragment of existing elements with no specific root.
     * @param props The fragment properties.
     * @returns The fragment children.
     */
    function Fragment(props) {
        return props.children;
    }
    FSComponent.Fragment = Fragment;
    /**
     * Builds a JSX based FSComponent.
     * @param type The DOM element tag that will be built.
     * @param props The properties to apply to the DOM element.
     * @param children Any children of this DOM element.
     * @returns The JSX VNode for the component or element.
     */
    // eslint-disable-next-line no-inner-declarations
    function buildComponent(type, props, ...children) {
        let vnode = null;
        if (typeof type === 'string') {
            let element;
            if (svgTags[type] !== undefined) {
                element = document.createElementNS('http://www.w3.org/2000/svg', type);
            }
            else {
                element = document.createElement(type);
            }
            if (props !== null) {
                for (const key in props) {
                    if (key === 'ref' && props.ref !== undefined) {
                        props.ref.instance = element;
                    }
                    else {
                        const prop = props[key];
                        if (prop instanceof Subject || prop instanceof MappedSubject || prop instanceof ComputedSubject) {
                            element.setAttribute(key, prop.get());
                            prop.sub((v) => {
                                element.setAttribute(key, v);
                            });
                        }
                        else {
                            element.setAttribute(key, prop);
                        }
                    }
                }
            }
            vnode = {
                instance: element,
                props: props,
                children: null
            };
            vnode.children = createChildNodes(vnode, children);
        }
        else if (typeof type === 'function') {
            if (children !== null && props === null) {
                props = {
                    children: children
                };
            }
            else if (props !== null) {
                props.children = children;
            }
            if (typeof type === 'function' && type.name === 'Fragment') {
                let childNodes = type(props);
                //Handle the case where the single fragment children is an array of nodes passsed down from above
                if (childNodes !== null && childNodes.length > 0 && Array.isArray(childNodes[0])) {
                    childNodes = childNodes[0];
                }
                vnode = {
                    instance: null,
                    props,
                    children: childNodes
                };
            }
            else {
                let instance;
                try {
                    instance = type(props);
                }
                catch (_a) {
                    instance = new type(props);
                }
                if (props !== null && props.ref !== null && props.ref !== undefined) {
                    props.ref.instance = instance;
                }
                if (instance.contextType !== undefined) {
                    instance.context = instance.contextType.map(c => Subject.create(c.defaultValue));
                }
                vnode = {
                    instance,
                    props,
                    children: [instance.render()]
                };
            }
        }
        return vnode;
    }
    FSComponent.buildComponent = buildComponent;
    /**
     * Creates the collection of child VNodes.
     * @param parent The parent VNode.
     * @param children The JSX children to convert to nodes.
     * @returns A collection of child VNodes.
     */
    function createChildNodes(parent, children) {
        let vnodes = null;
        if (children !== null && children !== undefined && children.length > 0) {
            vnodes = [];
            for (const child of children) {
                if (child !== null) {
                    if (child instanceof Subject || child instanceof MappedSubject || child instanceof ComputedSubject) {
                        const subjectValue = child.get().toString();
                        const node = {
                            instance: subjectValue === '' ? ' ' : subjectValue,
                            children: null,
                            props: null,
                            root: undefined,
                        };
                        child.sub((v) => {
                            if (node.root !== undefined) {
                                // TODO workaround. gotta find a solution for the text node vanishing when text is empty
                                node.root.nodeValue = v === '' ? ' ' : v.toString();
                            }
                        });
                        vnodes.push(node);
                    }
                    else if (child instanceof Array) {
                        const arrayNodes = createChildNodes(parent, child);
                        if (arrayNodes !== null) {
                            vnodes.push(...arrayNodes);
                        }
                    }
                    else if (typeof child === 'string' || typeof child === 'number') {
                        vnodes.push(createStaticContentNode(child));
                    }
                    else if (typeof child === 'object') {
                        vnodes.push(child);
                    }
                }
            }
        }
        return vnodes;
    }
    FSComponent.createChildNodes = createChildNodes;
    /**
     * Creates a static content VNode.
     * @param content The content to create a node for.
     * @returns A static content VNode.
     */
    function createStaticContentNode(content) {
        return {
            instance: content,
            children: null,
            props: null
        };
    }
    FSComponent.createStaticContentNode = createStaticContentNode;
    /**
     * Renders a VNode to a DOM element.
     * @param node The node to render.
     * @param element The DOM element to render to.
     * @param position The RenderPosition to put the item in.
     */
    function render(node, element, position = RenderPosition.In) {
        if (node.children && node.children.length > 0 && element !== null) {
            const componentInstance = node.instance;
            if (componentInstance !== null && componentInstance.onBeforeRender !== undefined) {
                componentInstance.onBeforeRender();
            }
            if (node.instance instanceof HTMLElement || node.instance instanceof SVGElement) {
                insertNode(node, position, element);
            }
            else {
                for (const child of node.children) {
                    insertNode(child, position, element);
                }
            }
            const instance = node.instance;
            if (instance instanceof ContextProvider) {
                visitNodes(node, (n) => {
                    const nodeInstance = n.instance;
                    if (nodeInstance !== null && nodeInstance.contextType !== undefined) {
                        const contextSlot = nodeInstance.contextType.indexOf(instance.parent);
                        if (contextSlot >= 0) {
                            if (nodeInstance.context === undefined) {
                                nodeInstance.context = [];
                            }
                            nodeInstance.context[contextSlot].set(instance.props.value);
                        }
                        if (nodeInstance instanceof ContextProvider && nodeInstance !== instance && nodeInstance.parent === instance.parent) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            if (componentInstance !== null && componentInstance.onAfterRender !== undefined) {
                componentInstance.onAfterRender(node);
            }
        }
    }
    FSComponent.render = render;
    /**
     * Inserts a node into the DOM.
     * @param node The node to insert.
     * @param position The position to insert the node in.
     * @param element The element to insert relative to.
     */
    function insertNode(node, position, element) {
        var _a, _b, _c, _d, _e, _f;
        if (node.instance instanceof HTMLElement || node.instance instanceof SVGElement) {
            switch (position) {
                case RenderPosition.In:
                    element.appendChild(node.instance);
                    node.root = (_a = element.lastChild) !== null && _a !== void 0 ? _a : undefined;
                    break;
                case RenderPosition.Before:
                    element.insertAdjacentElement('beforebegin', node.instance);
                    node.root = (_b = element.previousSibling) !== null && _b !== void 0 ? _b : undefined;
                    break;
                case RenderPosition.After:
                    element.insertAdjacentElement('afterend', node.instance);
                    node.root = (_c = element.nextSibling) !== null && _c !== void 0 ? _c : undefined;
                    break;
            }
            if (node.children !== null) {
                for (const child of node.children) {
                    insertNode(child, RenderPosition.In, node.instance);
                }
            }
        }
        else if (typeof node.instance === 'string') {
            switch (position) {
                case RenderPosition.In:
                    element.insertAdjacentHTML('beforeend', node.instance);
                    node.root = (_d = element.lastChild) !== null && _d !== void 0 ? _d : undefined;
                    break;
                case RenderPosition.Before:
                    element.insertAdjacentHTML('beforebegin', node.instance);
                    node.root = (_e = element.previousSibling) !== null && _e !== void 0 ? _e : undefined;
                    break;
                case RenderPosition.After:
                    element.insertAdjacentHTML('afterend', node.instance);
                    node.root = (_f = element.nextSibling) !== null && _f !== void 0 ? _f : undefined;
                    break;
            }
        }
        else if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                render(node[i], element);
            }
        }
        else {
            render(node, element);
        }
    }
    /**
     * Render a node before a DOM element.
     * @param node The node to render.
     * @param element The element to render boeore.
     */
    function renderBefore(node, element) {
        render(node, element, RenderPosition.Before);
    }
    FSComponent.renderBefore = renderBefore;
    /**
     * Render a node after a DOM element.
     * @param node The node to render.
     * @param element The element to render after.
     */
    function renderAfter(node, element) {
        render(node, element, RenderPosition.After);
    }
    FSComponent.renderAfter = renderAfter;
    /**
     * Remove a previously rendered element.  Currently, this is just a simple
     * wrapper so that all of our high-level "component maniuplation" state is kept
     * in the FSComponent API, but it's not doing anything other than a simple
     * remove() on the element.   This can probably be enhanced.
     * @param element The element to remove.
     */
    function remove(element) {
        if (element !== null) {
            element.remove();
        }
    }
    FSComponent.remove = remove;
    /**
     * Creates a component or element node reference.
     * @returns A new component or element node reference.
     */
    function createRef() {
        return new NodeReference();
    }
    FSComponent.createRef = createRef;
    /**
     * Creates a new context to hold data for passing to child components.
     * @param defaultValue The default value of this context.
     * @returns A new context.
     */
    function createContext(defaultValue) {
        return new Context(defaultValue);
    }
    FSComponent.createContext = createContext;
    /**
     * Visits VNodes with a supplied visitor function within the given children tree.
     * @param node The node to visit.
     * @param visitor The visitor function to inspect VNodes with. Return true if the search should stop at the visited
     * node and not proceed any further down the node's children.
     * @returns True if the visitation should break, or false otherwise.
     */
    function visitNodes(node, visitor) {
        const stopVisitation = visitor(node);
        if (!stopVisitation && node.children !== null) {
            for (let i = 0; i < node.children.length; i++) {
                visitNodes(node.children[i], visitor);
            }
        }
        return true;
    }
    FSComponent.visitNodes = visitNodes;
    /**
     * An empty callback handler.
     */
    FSComponent.EmptyHandler = () => { return; };
})(FSComponent || (FSComponent = {}));
FSComponent.Fragment;

// eslint-disable-next-line @typescript-eslint/no-namespace
var Wait;
(function (Wait) {
    /**
     * Waits for a set amount of time.
     * @param delay The amount of time to wait in milliseconds.
     * @returns a Promise which is fulfilled after the delay.
     */
    // eslint-disable-next-line no-inner-declarations
    function awaitDelay(delay) {
        return new Promise(resolve => setTimeout(() => resolve(), delay));
    }
    Wait.awaitDelay = awaitDelay;
    /**
     * Waits for a condition to be satisfied.
     * @param predicate A function which evaluates whether the condition is satisfied.
     * @param interval The interval, in milliseconds, at which to evaluate the condition. A zero or negative value
     * causes the condition to be evaluated every frame. Defaults to 0.
     * @param timeout The amount of time, in milliseconds, before the returned Promise is rejected if the condition is
     * not satisfied. A zero or negative value causes the Promise to never be rejected and the condition to be
     * continually evaluated until it is satisfied. Defaults to 0.
     * @returns a Promise which is fulfilled when the condition is satisfied.
     */
    // eslint-disable-next-line no-inner-declarations
    function awaitCondition(predicate, interval = 0, timeout = 0) {
        const t0 = Date.now();
        if (interval <= 0) {
            const loopFunc = (resolve, reject) => {
                if (timeout > 0 && Date.now() - t0 >= timeout) {
                    reject('Await condition timed out.');
                }
                else {
                    predicate() ? resolve() : requestAnimationFrame(loopFunc.bind(undefined, resolve, reject));
                }
            };
            return new Promise((resolve, reject) => { loopFunc(resolve, reject); });
        }
        else {
            return new Promise((resolve, reject) => {
                const timer = setInterval(() => {
                    if (timeout > 0 && Date.now() - t0 > timeout) {
                        clearInterval(timer);
                        reject('Await condition timed out.');
                    }
                    else if (predicate()) {
                        clearInterval(timer);
                        resolve();
                    }
                }, interval);
            });
        }
    }
    Wait.awaitCondition = awaitCondition;
})(Wait || (Wait = {}));

/**
 * An event bus consumer for a specific topic.
 */
class Consumer {
    /**
     * Creates an instance of a Consumer.
     * @param bus The event bus to subscribe to.
     * @param topic The topic of the subscription.
     * @param state The state for the consumer to track.
     * @param currentHandler The current build filter handler stack, if any.
     */
    constructor(bus, topic, state = {}, currentHandler) {
        this.bus = bus;
        this.topic = topic;
        this.state = state;
        this.currentHandler = currentHandler;
    }
    /**
     * Handles an event using the provided event handler.
     * @param handler The event handler for the event.
     */
    handle(handler) {
        if (this.currentHandler !== undefined) {
            /**
             * The handler reference to store.
             * @param data The input data to the handler.
             */
            this.handlerReference = (data) => {
                if (this.currentHandler !== undefined) {
                    this.currentHandler(data, this.state, handler);
                }
            };
            this.bus.on(this.topic, this.handlerReference);
        }
        else {
            this.bus.on(this.topic, handler);
        }
    }
    /**
     * Disables handling of the event.
     * @param handler The handler to disable.
     */
    off(handler) {
        if (this.handlerReference !== undefined) {
            this.bus.off(this.topic, this.handlerReference);
        }
        else {
            this.bus.off(this.topic, handler);
        }
    }
    /**
     * Caps the event subscription to a specified frequency, in Hz.
     * @param frequency The frequency, in Hz, to cap to.
     * @returns A new consumer with the applied frequency filter.
     */
    atFrequency(frequency) {
        const deltaTimeTrigger = 1000 / frequency;
        return new Consumer(this.bus, this.topic, { previousTime: Date.now() }, (data, state, next) => {
            const currentTime = Date.now();
            const deltaTime = currentTime - state.previousTime;
            if (deltaTimeTrigger <= deltaTime) {
                while ((state.previousTime + deltaTimeTrigger) < currentTime) {
                    state.previousTime += deltaTimeTrigger;
                }
                this.with(data, next);
            }
        });
    }
    /**
     * Quantizes the numerical event data to consume only at the specified decimal precision.
     * @param precision The decimal precision to snap to.
     * @returns A new consumer with the applied precision filter.
     */
    withPrecision(precision) {
        return new Consumer(this.bus, this.topic, { lastValue: 0 }, (data, state, next) => {
            const dataValue = data;
            const multiplier = Math.pow(10, precision);
            const currentValueAtPrecision = Math.round(dataValue * multiplier) / multiplier;
            if (currentValueAtPrecision !== state.lastValue) {
                state.lastValue = currentValueAtPrecision;
                this.with(currentValueAtPrecision, next);
            }
        });
    }
    /**
     * Quantizes the Arinc429 event data to consume only at the specified decimal precision.
     * @param precision The decimal precision to snap to.
     * @returns A new consumer with the applied precision filter.
     */
    withArinc429Precision(precision) {
        return new Consumer(this.bus, this.topic, { lastValue: 0 }, (data, state, next) => {
            const dataValue = data.value;
            const multiplier = Math.pow(10, precision);
            const currentValueAtPrecision = Math.round(dataValue * multiplier) / multiplier;
            if (currentValueAtPrecision !== state.lastValue
                || state.hasNormalOps !== data.isNormalOperation()
                || state.isNoComputedData !== data.isNoComputedData()
                || state.isFailureWarning !== data.isFailureWarning()) {
                state.lastValue = currentValueAtPrecision;
                state.hasNormalOps = data.isNormalOperation();
                state.isNoComputedData = data.isNoComputedData();
                state.isFailureWarning = data.isFailureWarning();
                this.with(data, next);
            }
        });
    }
    /**
     * Filter the subscription to consume only when the value has changed by a minimum amount.
     * @param amount The minimum amount threshold below which the consumer will not consume.
     * @returns A new consumer with the applied change threshold filter.
     */
    whenChangedBy(amount) {
        return new Consumer(this.bus, this.topic, { lastValue: 0 }, (data, state, next) => {
            const dataValue = data;
            const diff = Math.abs(dataValue - state.lastValue);
            if (diff >= amount) {
                state.lastValue = dataValue;
                this.with(data, next);
            }
        });
    }
    /**
     * Filter the subscription to consume only if the value has changed. At all.  Really only
     * useful for strings or other events that don't change much.
     * @returns A new consumer with the applied change threshold filter.
     */
    whenChanged() {
        return new Consumer(this.bus, this.topic, { lastValue: '' }, (data, state, next) => {
            if (state.lastValue !== data) {
                state.lastValue = data;
                this.with(data, next);
            }
        });
    }
    /**
     * Filters events by time such that events will not be consumed until a minimum duration
     * has passed since the previous event.
     * @param deltaTime The minimum delta time between events.
     * @returns A new consumer with the applied change threshold filter.
     */
    onlyAfter(deltaTime) {
        return new Consumer(this.bus, this.topic, { previousTime: Date.now() }, (data, state, next) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - state.previousTime;
            if (timeDiff > deltaTime) {
                state.previousTime += deltaTime;
                this.with(data, next);
            }
        });
    }
    /**
     * Builds a handler stack from the current handler.
     * @param data The data to send in to the handler.
     * @param handler The handler to use for processing.
     */
    with(data, handler) {
        if (this.currentHandler !== undefined) {
            this.currentHandler(data, this.state, handler);
        }
        else {
            handler(data);
        }
    }
}

/**
 * A typed container for subscribers interacting with the Event Bus.
 */
class EventSubscriber {
    /**
     * Creates an instance of an EventSubscriber.
     * @param bus The EventBus that is the parent of this instance.
     */
    constructor(bus) {
        this.bus = bus;
    }
    /**
     * Subscribes to a topic on the bus.
     * @param topic The topic to subscribe to.
     * @returns A consumer to bind the event handler to.
     */
    on(topic) {
        return new Consumer(this.bus, topic);
    }
}

/// <reference types="msfstypes/JS/common" />
/**
 * An event bus that can be used to publish data from backend
 * components and devices to consumers.
 */
class EventBus {
    /**
     * Creates an instance of an EventBus.
     * @param useStorageSync Whether or not to use storage sync (optional, default false)
     */
    constructor(useStorageSync) {
        this._topicHandlersMap = new Map();
        this._wildcardHandlers = new Array();
        this._eventCache = new Map();
        this._busId = Math.floor(Math.random() * 2147483647);
        const syncFunc = useStorageSync ? EventBusStorageSync : EventBusCoherentSync;
        this._busSync = new syncFunc(this.pub.bind(this), this._busId);
        this.syncEvent('event_bus', 'resync_request', false);
        this.on('event_bus', (data) => {
            if (data == 'resync_request') {
                this.resyncEvents();
            }
        });
    }
    /**
     * Subscribes to a topic on the bus.
     * @param topic The topic to subscribe to.
     * @param handler The handler to be called when an event happens.
     */
    on(topic, handler) {
        var _a;
        const handlers = this._topicHandlersMap.get(topic);
        const isNew = !(handlers && handlers.push(handler));
        if (isNew) {
            this._topicHandlersMap.set(topic, [handler]);
        }
        const lastState = (_a = this._eventCache.get(topic)) === null || _a === void 0 ? void 0 : _a.data;
        if (this._eventCache.get(topic) !== undefined) {
            handler(lastState);
        }
    }
    /**
     * Unsubscribes a handler from the topic's events.
     * @param topic The topic to unsubscribe from.
     * @param handler The handler to unsubscribe from topic.
     */
    off(topic, handler) {
        const handlers = this._topicHandlersMap.get(topic);
        if (handlers) {
            handlers.splice(handlers.indexOf(handler) >>> 0, 1);
        }
    }
    /**
     * Subscribe to the handler as * to all topics.
     * @param handler The handler to subscribe to all events.
     */
    onAll(handler) {
        this._wildcardHandlers.push(handler);
    }
    /**
     * Unsubscribe the handler from all topics.
     * @param handler The handler to unsubscribe from all events.
     */
    offAll(handler) {
        const handlerIndex = this._wildcardHandlers.indexOf(handler);
        if (handlerIndex > -1) {
            this._wildcardHandlers.splice(handlerIndex >>> 0, 1);
        }
    }
    /**
     * Publishes an event to the topic on the bus.
     * @param topic The topic to publish to.
     * @param data The data portion of the event.
     * @param sync Whether or not this message needs to be synced on local stoage.
     * @param isCached Whether or not this message will be resync'd across the bus on load.
     */
    pub(topic, data, sync = false, isCached = true) {
        if (isCached) {
            this._eventCache.set(topic, { data: data, synced: sync });
        }
        const handlers = this._topicHandlersMap.get(topic);
        if (handlers !== undefined) {
            const len = handlers.length;
            for (let i = 0; i < len; i++) {
                try {
                    handlers[i](data);
                }
                catch (error) {
                    console.error(`Error in EventBus Handler: ${error}`);
                    if (error instanceof Error) {
                        console.error(error.stack);
                    }
                }
            }
        }
        // We don't know if anything is subscribed on busses in other instruments,
        // so we'll unconditionally sync if sync is true and trust that the
        // publisher knows what it's doing.
        if (sync) {
            this.syncEvent(topic, data, isCached);
        }
        // always push to wildcard handlers
        const wcLen = this._wildcardHandlers.length;
        for (let i = 0; i < wcLen; i++) {
            this._wildcardHandlers[i](topic, data);
        }
    }
    /**
     * Re-sync all synced events
     */
    resyncEvents() {
        for (const [topic, event] of this._eventCache) {
            if (event.synced) {
                this.syncEvent(topic, event.data, true);
            }
        }
    }
    /**
     * Publish an event to the sync bus.
     * @param topic The topic to publish to.
     * @param data The data to publish.
     * @param isCached Whether or not this message will be resync'd across the bus on load.
     */
    syncEvent(topic, data, isCached) {
        this._busSync.sendEvent(topic, data, isCached);
    }
    /**
     * Gets a typed publisher from the event bus..
     * @returns The typed publisher.
     */
    getPublisher() {
        return this;
    }
    /**
     * Gets a typed subscriber from the event bus.
     * @returns The typed subscriber.
     */
    getSubscriber() {
        return new EventSubscriber(this);
    }
}
/**
 * A class that manages event bus synchronization via data storage.
 */
class EventBusStorageSync {
    /**
     * Creates an instance of EventBusStorageSync.
     * @param recvEventCb A callback to execute when an event is received on the bus.
     * @param busId The ID of the bus.  Derp.
     */
    constructor(recvEventCb, busId) {
        this.recvEventCb = recvEventCb;
        this.busId = busId;
        window.addEventListener('storage', this.receiveEvent.bind(this));
    }
    /**
     * Sends an event via storage events.
     * @param topic The topic to send data on.
     * @param data The data to send.
     */
    sendEvent(topic, data) {
        // TODO can we do the stringing more gc friendly?
        // TODO we could not stringify on simple types, but the receiver wouldn't know I guess
        // TODO add handling for busIds to avoid message loops
        localStorage.setItem(EventBusStorageSync.EB_KEY, `${topic.toString()},${data !== undefined ? JSON.stringify(data) : EventBusStorageSync.EMPTY_DATA}`);
        // TODO move removeItem to a function called at intervals instead of every time?
        localStorage.removeItem(EventBusStorageSync.EB_KEY);
    }
    /**
     * Receives an event from storage and syncs onto the bus.
     * @param e The storage event that was received.
     */
    receiveEvent(e) {
        // TODO only react on topics that have subscribers
        if (e.key === EventBusStorageSync.EB_KEY && e.newValue) {
            const val = e.newValue.split(',');
            this.recvEventCb(val[0], val.length > 1 ? JSON.parse(val[1]) : undefined, true);
        }
    }
}
EventBusStorageSync.EMPTY_DATA = '{}';
EventBusStorageSync.EB_KEY = 'eb.evt';
/**
 * A class that manages event bus synchronization via Coherent notifications.
 */
class EventBusCoherentSync {
    /**
     * Creates an instance of EventBusCoherentSync.
     * @param recvEventCb A callback to execute when an event is received on the bus.
     * @param busId The ID of the bus.  Derp.
     */
    constructor(recvEventCb, busId) {
        this.evtNum = 0;
        this.lastEventSynced = -1;
        this.recvEventCb = recvEventCb;
        this.busId = busId;
        this.listener = RegisterViewListener(EventBusCoherentSync.EB_LISTENER_KEY);
        this.listener.on(EventBusCoherentSync.EB_KEY, this.receiveEvent.bind(this));
    }
    /**
     * Sends an event via Coherent events.
     * @param topic The topic to send data on.
     * @param data The data to send.
     * @param isCached Whether or not this event is cached.
     */
    sendEvent(topic, data, isCached) {
        this.listener.triggerToAllSubscribers(EventBusCoherentSync.EB_KEY, { topic, data, isCached, busId: this.busId, evtNum: this.evtNum++ });
    }
    /**
     * Receives an event via Coherent and syncs onto the bus.
     * @param e The storage event that was received.
     */
    receiveEvent(e) {
        // If we've sent this event, don't act on it.
        if (e.busId == this.busId) {
            return;
        }
        if (this.lastEventSynced !== e.evtNum) {
            // TODO only react on topics that have subscribers
            this.lastEventSynced = e.evtNum;
            this.recvEventCb(e['topic'], e['data'], undefined, e['isCached']);
        }
    }
}
EventBusCoherentSync.EMPTY_DATA = '{}';
EventBusCoherentSync.EB_KEY = 'eb.evt';
EventBusCoherentSync.EB_LISTENER_KEY = 'JS_LISTENER_SIMVARS';

/**
 * A basic event-bus publisher.
 */
class BasePublisher {
    /**
     * Creates an instance of BasePublisher.
     * @param bus The common event bus.
     * @param pacer An optional pacer to control the rate of publishing.
     */
    constructor(bus, pacer = undefined) {
        this.bus = bus;
        this.publisher = this.bus.getPublisher();
        this.publishActive = false;
        this.pacer = pacer;
    }
    /**
     * Start publishing.
     */
    startPublish() {
        this.publishActive = true;
    }
    /**
     * Stop publishing.
     */
    stopPublish() {
        this.publishActive = false;
    }
    /**
     * Tells whether or not the publisher is currently active.
     * @returns True if the publisher is active, false otherwise.
     */
    isPublishing() {
        return this.publishActive;
    }
    /**
     * A callback called when the publisher receives an update cycle.
     */
    onUpdate() {
        return;
    }
    /**
     * Publish a message if publishing is acpive
     * @param topic The topic key to publish to.
     * @param data The data type for chosen topic.
     * @param sync Whether or not the event should be synced via local storage.
     * @param isCached Whether or not the event should be cached.
     */
    publish(topic, data, sync = false, isCached = true) {
        if (this.publishActive && (!this.pacer || this.pacer.canPublish(topic, data))) {
            this.publisher.pub(topic, data, sync, isCached);
        }
    }
}
/**
 * A base class for publishers that need to handle simvars with built-in
 * support for pacing callbacks.
 */
class SimVarPublisher extends BasePublisher {
    /**
     * Create a SimVarPublisher
     * @param simVarMap A map of simvar event type keys to a SimVarDefinition.
     * @param bus The EventBus to use for publishing.
     * @param pacer An optional pacer to control the rate of publishing.
     */
    constructor(simVarMap, bus, pacer = undefined) {
        super(bus, pacer);
        this.simvars = simVarMap;
        this.subscribed = new Set();
    }
    /**
     * Subscribe to an event type to begin publishing.
     * @param data Key of the event type in the simVarMap
     */
    subscribe(data) {
        this.subscribed.add(data);
    }
    /**
     * Unsubscribe to an event to stop publishing.
     * @param data Key of the event type in the simVarMap
     */
    unsubscribe(data) {
        // TODO If we have multiple subscribers we may want to add reference counting here.
        this.subscribed.delete(data);
    }
    /**
     * Read the value of a given simvar by its key.
     * @param key The key of the simvar in simVarMap
     * @returns The value returned by SimVar.GetSimVarValue()
     */
    getValue(key) {
        const simvar = this.simvars.get(key);
        if (simvar === undefined) {
            return undefined;
        }
        return SimVar.GetSimVarValue(simvar.name, simvar.type);
    }
    /**
     * Publish all subscribed data points to the bus.
     */
    onUpdate() {
        for (const data of this.subscribed.values()) {
            const value = this.getValue(data);
            if (value !== undefined) {
                this.publish(data, value);
            }
        }
    }
    /**
     * Change the simvar read for a given key.
     * @param key The key of the simvar in simVarMap
     * @param value The new value to set the simvar to.
     */
    updateSimVarSource(key, value) {
        this.simvars.set(key, value);
    }
}

/**
 * A publisher for publishing H:Events on the bus.
 */
class HEventPublisher extends BasePublisher {
    /**
     * Dispatches an H:Event to the event bus.
     * @param hEvent The H:Event to dispatch.
     * @param sync Whether this event should be synced (optional, default false)
     */
    dispatchHEvent(hEvent, sync = false) {
        //console.log(`dispaching hevent:  ${hEvent}`);
        this.publish('hEvent', hEvent, sync, false);
    }
}

/**
 * Valid type arguments for Set/GetSimVarValue
 */
var SimVarValueType;
(function (SimVarValueType) {
    SimVarValueType["Number"] = "number";
    SimVarValueType["Degree"] = "degrees";
    SimVarValueType["Knots"] = "knots";
    SimVarValueType["Feet"] = "feet";
    SimVarValueType["Meters"] = "meters";
    SimVarValueType["FPM"] = "feet per minute";
    SimVarValueType["Radians"] = "radians";
    SimVarValueType["InHG"] = "inches of mercury";
    SimVarValueType["MB"] = "Millibars";
    SimVarValueType["Bool"] = "Bool";
    SimVarValueType["Celsius"] = "celsius";
    SimVarValueType["MHz"] = "MHz";
    SimVarValueType["KHz"] = "KHz";
    SimVarValueType["NM"] = "nautical mile";
    SimVarValueType["String"] = "string";
    SimVarValueType["RPM"] = "Rpm";
    SimVarValueType["PPH"] = "Pounds per hour";
    SimVarValueType["GPH"] = "gph";
    SimVarValueType["Farenheit"] = "farenheit";
    SimVarValueType["PSI"] = "psi";
    SimVarValueType["GAL"] = "gallons";
    SimVarValueType["Hours"] = "Hours";
    SimVarValueType["Volts"] = "Volts";
    SimVarValueType["Amps"] = "Amperes";
    SimVarValueType["Seconds"] = "seconds";
    SimVarValueType["Enum"] = "Enum";
    SimVarValueType["LLA"] = "latlonalt";
    SimVarValueType["MetersPerSecond"] = "meters per second";
    SimVarValueType["GForce"] = "G Force";
})(SimVarValueType || (SimVarValueType = {}));

/// <reference types="msfstypes/JS/dataStorage" />
/* eslint-disable no-inner-declarations */
// eslint-disable-next-line @typescript-eslint/no-namespace
var DataStore;
(function (DataStore) {
    /**
     * Writes a keyed value to the data store.
     * @param key A key.
     * @param value The value to set.
     */
    function set(key, value) {
        SetStoredData(key, JSON.stringify(value));
    }
    DataStore.set = set;
    /**
     * Retrieves a keyed value from the data store.
     * @param key A key.
     * @returns the value stored under the key, or undefined if one could not be retrieved.
     */
    function get(key) {
        try {
            const string = GetStoredData(key);
            return JSON.parse(string);
        }
        catch (e) {
            return undefined;
        }
    }
    DataStore.get = get;
    /**
     * Removes a key from the data store.
     * @param key The key to remove.
     */
    function remove(key) {
        DeleteStoredData(key);
    }
    DataStore.remove = remove;
})(DataStore || (DataStore = {}));

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class BlackOutlineLine extends DisplayComponent {
    render() {
        var _a, _b, _c, _d, _e;
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("path", { stroke: "black", "stroke-width": (_a = this.props.blackStroke) !== null && _a !== void 0 ? _a : 4, "stroke-linecap": "round", d: this.props.d, style: (_b = this.props.styleBlack) !== null && _b !== void 0 ? _b : "", "stroke-linejoin": "round" }),
            FSComponent.buildComponent("path", { stroke: (_c = this.props.color) !== null && _c !== void 0 ? _c : "white", "stroke-width": (_d = this.props.whiteStroke) !== null && _d !== void 0 ? _d : 3, "stroke-linecap": "round", d: this.props.d, style: (_e = this.props.styleColor) !== null && _e !== void 0 ? _e : "", "stroke-linejoin": "round" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class SlipIndicator extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.slipGroup = FSComponent.createRef();
        this.fillOpacity = Subject.create(0);
    }
    angleToDisplacement(sideslip) {
        return Math.min(sideslip * 1.25, 33);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("sideslip")
            .whenChangedBy(0.05)
            .handle((sideslip) => {
            const angle = this.angleToDisplacement(sideslip);
            this.slipGroup.instance.style.transform = `translate(${angle}px, 0px)`;
            this.fillOpacity.set(Math.abs(angle) >= 33 ? 1 : 0);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { ref: this.slipGroup },
            FSComponent.buildComponent("path", { fill: "none", stroke: "black", "stroke-width": "4", d: "M333 214, h32, v 6, h-32, Z", "stroke-linejoin": "round" }),
            FSComponent.buildComponent("path", { fill: this.props.colour, "fill-opacity": this.fillOpacity, stroke: this.props.colour, "stroke-width": "3", d: "M333 214, h32, v 6, h-32, Z", "stroke-linejoin": "round" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class BankIndicator extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.strokeColour = Subject.create("none");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        this.props.colour.sub((colour) => {
            this.strokeColour.set(colour === "white" ? "none" : "#ffc400");
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("path", { fill: "none", stroke: "black", "stroke-width": "4", d: "M349 194, l-16 20, h32, Z", "stroke-linejoin": "round" }),
            FSComponent.buildComponent("path", { fill: this.strokeColour, stroke: this.props.colour, "stroke-width": "3", d: "M349 194, l-16 20, h32, Z", "stroke-linejoin": "round" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class PitchLimitIndicator extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.maneuveringSpeed = 0;
        this.flapsHandle = 0;
        this.altAboveGround = 0;
        this.incidenceAlpha = 0;
        this.stallAlpha = 0;
        this.pliTransformRef = FSComponent.createRef();
        this.visibility = Subject.create("hidden");
    }
    // TODO: airspeed logic for flaps up pli
    pliPitch(alpha, stallAlpha) {
        return stallAlpha - alpha;
    }
    isPliOn(airspeed, manSpeed, flapsHandle, alt) {
        return (airspeed < manSpeed || flapsHandle != 0) && alt > 10;
    }
    degreesToPixels(angle) {
        return angle < 0 ? Math.max(angle * 8, -12 * 8) : Math.min(angle * 8, 12 * 8);
    }
    handlePitchLimitTransform() {
        this.pliTransformRef.instance.style.transform = `translate(0px, ${this.degreesToPixels(Math.max(-1 * this.pliPitch(this.incidenceAlpha, this.stallAlpha), -30))}px)`;
    }
    handleVisibility() {
        this.visibility.set(this.isPliOn(this.airspeed, this.maneuveringSpeed, this.flapsHandle, this.altAboveGround) ? "visible" : "hidden");
    }
    // wondering how i'm gonna find a way
    // it's over
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.handleVisibility();
        });
        sub.on("maneuveringSpeed")
            .whenChangedBy(0.25)
            .handle((manSpeed) => {
            this.maneuveringSpeed = manSpeed;
            this.handleVisibility();
        });
        sub.on("flapsHandle")
            .whenChanged()
            .handle((flaps) => {
            this.flapsHandle = flaps;
            this.handleVisibility();
        });
        sub.on("altAboveGround")
            .withPrecision(1)
            .handle((altitude) => {
            this.altAboveGround = altitude;
            this.handleVisibility();
        });
        sub.on("incidenceAlpha")
            .whenChangedBy(0.05)
            .handle((alpha) => {
            this.incidenceAlpha = alpha;
            this.handlePitchLimitTransform();
        });
        sub.on("stallAlpha")
            .whenChangedBy(0.05)
            .handle((stallAlpha) => {
            this.stallAlpha = stallAlpha;
            this.handlePitchLimitTransform();
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { ref: this.pliTransformRef, visibility: this.visibility },
            FSComponent.buildComponent(BlackOutlineLine, { d: "M416 382, h33, m 0 0, h-8, l9 -14, m-9 14, m-9 0, l9 -14, m-18 14, l9 -14, m-17 14, v10", blackStroke: 5, color: "#ffc400", styleBlack: "fill: none;", styleColor: "fill: none;" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M282 382, h-33, m 0 0, h8, l-9 -14, m9 14, m9 0, l-9 -14, m18 14, l-9 -14, m17 14, v10", blackStroke: 5, color: "#ffc400", styleBlack: "fill: none;", styleColor: "fill: none;" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class FlightDirector extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.pitch = 0;
        this.roll = 0;
        this.height = 0;
        this.fdPitch = 0;
        this.fdRoll = 0;
        this.irsState = 0;
        this.fdOn = false;
        this.pitchGroup = FSComponent.createRef();
        this.rollGroup = FSComponent.createRef();
        this.visibility = Subject.create("hidden");
    }
    degreesToPixels(angle) {
        return angle < 0 ? Math.max(angle * 8, -12 * 8) : Math.min(angle * 8, 12 * 8);
    }
    handleTransform() {
        this.pitchGroup.instance.style.transform = `translate(0px, ${this.degreesToPixels((this.height < 5 ? -8 : this.fdPitch) - this.pitch)}px)`;
        this.rollGroup.instance.style.transform = `translate(${this.degreesToPixels((-this.fdRoll + this.roll) / 4)}px, 0px)`;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("pitch")
            .withPrecision(2)
            .handle((pitch) => {
            this.pitch = pitch;
            this.handleTransform();
        });
        sub.on("roll")
            .withPrecision(2)
            .handle((roll) => {
            this.roll = roll;
            this.handleTransform();
        });
        sub.on("altAboveGround")
            .withPrecision(1)
            .handle((height) => {
            this.height = height;
            this.handleTransform();
        });
        sub.on("fdPitch")
            .whenChangedBy(0.05)
            .handle((fdPitch) => {
            this.fdPitch = fdPitch;
            this.handleTransform();
        });
        sub.on("fdRoll")
            .whenChangedBy(0.05)
            .handle((fdRoll) => {
            this.fdRoll = fdRoll;
            this.handleTransform();
        });
        sub.on("irsState")
            .whenChanged()
            .handle((irsState) => {
            this.irsState = irsState;
            this.visibility.set(this.fdOn && this.irsState === 2 ? "visible" : "hidden");
        });
        sub.on("fdOn")
            .whenChanged()
            .handle((fdOn) => {
            this.fdOn = fdOn;
            this.visibility.set(this.fdOn && this.irsState === 2 ? "visible" : "hidden");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { ref: this.pitchGroup, visibility: this.visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M239 382, h220", color: "#d570ff", whiteStroke: 5, blackStroke: 7 })),
            FSComponent.buildComponent("g", { ref: this.rollGroup, visibility: this.visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M349 272, v220", color: "#d570ff", whiteStroke: 5, blackStroke: 7 }))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class FlightPathVector extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.groundSpeed = 0;
        this.verticalVelocity = 0;
        this.horizontalVelocity = 0;
        this.pitch = 0;
        this.heading = 0;
        this.track = 0;
        this.irsState = 0;
        this.isFpvOn = false;
        this.fpvTransformRef = FSComponent.createRef();
        this.fpvRotateSub = Subject.create("rotate(0deg)");
        this.visibility = Subject.create("hidden");
        this.fpvFailVisibility = Subject.create("hidden");
    }
    degreesToPixels(angle) {
        let newAngle = angle;
        if (this.groundSpeed < 1) {
            newAngle = 0;
        }
        return newAngle < 0 ? Math.max(newAngle * 8, -16 * 8) : Math.min(newAngle * 8, 22.5 * 8);
    }
    vertVecToPixels() {
        const fpa = (180 / Math.PI) * Math.asin(this.verticalVelocity / 60 / (this.horizontalVelocity / 60));
        return this.degreesToPixels(this.groundSpeed < 1 ? 0 : fpa + this.pitch);
    }
    trackToPixels() {
        let driftAngle = this.heading - this.track;
        if (driftAngle > 180) {
            driftAngle -= 360;
        }
        else if (driftAngle < -180) {
            driftAngle += 360;
        }
        driftAngle = driftAngle > 0 ? Math.min(driftAngle, 35) : Math.max(driftAngle, -35);
        return this.degreesToPixels(driftAngle * -0.25);
    }
    handleTransform() {
        this.fpvTransformRef.instance.style.transform = `translate(${this.trackToPixels()}px, ${-this.vertVecToPixels()}px)`;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("groundSpeed")
            .whenChangedBy(0.125)
            .handle((gs) => {
            this.groundSpeed = gs;
            this.handleTransform();
        });
        sub.on("verticalVelocity")
            .withPrecision(1)
            .handle((verticalVelocity) => {
            this.verticalVelocity = verticalVelocity;
            this.handleTransform();
        });
        sub.on("horizontalVelocity")
            .withPrecision(1)
            .handle((horizontalVelocity) => {
            this.horizontalVelocity = horizontalVelocity;
            this.handleTransform();
        });
        sub.on("pitch")
            .withPrecision(2)
            .handle((pitch) => {
            this.pitch = pitch;
            this.handleTransform();
        });
        sub.on("trueHeading")
            .whenChangedBy(0.05)
            .handle((heading) => {
            this.heading = heading;
            this.handleTransform();
        });
        sub.on("trueTrack")
            .whenChangedBy(0.05)
            .handle((track) => {
            this.track = track;
            this.handleTransform();
        });
        sub.on("roll")
            .withPrecision(2)
            .handle((roll) => this.fpvRotateSub.set(`rotate(${-roll}deg)`));
        sub.on("irsState")
            .whenChanged()
            .handle((state) => {
            this.irsState = state;
            this.visibility.set(this.irsState === 2 && this.isFpvOn ? "visible" : "hidden");
            this.fpvFailVisibility.set(this.irsState === 0 && this.isFpvOn ? "visible" : "hidden");
        });
        sub.on("fpvOn")
            .whenChanged()
            .handle((fpvOn) => {
            this.isFpvOn = fpvOn;
            this.visibility.set(this.irsState === 2 && this.isFpvOn ? "visible" : "hidden");
            this.fpvFailVisibility.set(this.irsState === 0 && this.isFpvOn ? "visible" : "hidden");
        });
        const hEventSub = this.props.bus.getSubscriber();
        hEventSub.on("hEvent").handle((event) => {
            if (event === "B747_8_PFD_FPV") {
                SimVar.SetSimVarValue("L:SALTY_FPV_ON", "Bool", !this.isFpvOn);
            }
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { ref: this.fpvTransformRef },
                FSComponent.buildComponent("g", { transform: this.fpvRotateSub, class: "horizon-group", visibility: this.visibility },
                    FSComponent.buildComponent("path", { class: "fpv-outline", d: "M311 382, h28" }),
                    FSComponent.buildComponent("path", { class: "fpv-outline", d: "M359 382, h28" }),
                    FSComponent.buildComponent("path", { class: "fpv-outline", d: "M349 372, v-14" }),
                    FSComponent.buildComponent("circle", { class: "fpv-outline", cx: "349", cy: "382", r: "10", stroke: "white", fill: "none" }),
                    FSComponent.buildComponent("path", { class: "fpv-line", d: "M311 382, h28" }),
                    FSComponent.buildComponent("path", { class: "fpv-line", d: "M359 382, h28" }),
                    FSComponent.buildComponent("path", { class: "fpv-line", d: "M349 372, v-14" }),
                    FSComponent.buildComponent("circle", { class: "fpv-line", cx: "349", cy: "382", r: "10", fill: "none" }))),
            FSComponent.buildComponent("g", { visibility: this.fpvFailVisibility },
                FSComponent.buildComponent("rect", { x: "196", y: "270", width: "52", height: "27", class: "line", fill: "none", "stroke-width": "3", stroke: "#ffc400" }),
                FSComponent.buildComponent("text", { x: "222", y: "294", class: "text-3 amber middle" }, "FPV"))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class MarkerBeacon extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.classSub = Subject.create("hidden");
        this.colourSub = Subject.create("");
        this.textSub = Subject.create("");
        this.markers = [
            ["", "", "hidden"],
            ["cyan", "OM", "outer-marker-blink"],
            ["#ffc400", "MM", "middle-marker-blink"],
            ["white", "IM", "inner-marker-blink"],
        ];
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("markerBeaconState")
            .whenChanged()
            .handle((state) => {
            this.colourSub.set(this.markers[state][0]);
            this.textSub.set(this.markers[state][1]);
            this.classSub.set(this.markers[state][2]);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { class: this.classSub },
            FSComponent.buildComponent("circle", { cx: "507", cy: "213", r: "20", fill: "black", class: "fpv-outline" }),
            FSComponent.buildComponent("circle", { cx: "507", cy: "213", r: "20", fill: "black", "stroke-width": "3px", stroke: this.colourSub }),
            FSComponent.buildComponent("text", { x: "507", y: "224", "font-size": "30", "letter-spacing": "-0.25", "text-anchor": "middle", stroke: "black", "stroke-width": "1.5px", "paint-order": "stroke", fillOpacity: 0.9, fill: this.colourSub }, this.textSub)));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class Horizon extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.horizonPitchGroup = FSComponent.createRef();
        this.horizonRollGroup = FSComponent.createRef();
        this.clipRef = FSComponent.createRef();
        this.horizonVisibility = Subject.create("visible");
        this.horizonFailVisibility = Subject.create("hidden");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("pitch")
            .withPrecision(2)
            .handle((pitch) => {
            this.horizonPitchGroup.instance.style.transform = `translate(0px, -18px) translate(0px, ${-pitch * 8}px)`;
            this.clipRef.instance.style.transform = `translate(0px, 18px) translate(0px, ${pitch * 8}px)`;
        });
        sub.on("roll")
            .withPrecision(2)
            .handle((roll) => (this.horizonRollGroup.instance.style.transform = `rotate(${roll}deg)`));
        sub.on("irsState")
            .whenChanged()
            .handle((state) => {
            this.horizonVisibility.set(state >= 2 ? "visible" : "hidden");
            this.horizonFailVisibility.set(state < 2 ? "visible" : "hidden");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { visibility: this.horizonVisibility },
                FSComponent.buildComponent("clipPath", { ref: this.clipRef, id: "ah-clip" },
                    FSComponent.buildComponent("path", { d: "M156 350, h30, v-40 c 83 -115 243 -115 323 0, v40, h30, v280, h-383 Z" })),
                FSComponent.buildComponent("g", { ref: this.horizonRollGroup, class: "horizon-group" },
                    FSComponent.buildComponent("g", { ref: this.horizonPitchGroup, class: "horizon-group" },
                        FSComponent.buildComponent("rect", { x: 0, y: -800, width: 800, height: 1200, fill: "#1469BC" }),
                        FSComponent.buildComponent("rect", { x: 0, y: 400, width: 800, height: 1200, fill: "#764D17" }),
                        FSComponent.buildComponent("rect", { x: 0, y: 397.5, width: 800, height: 4, fill: "#fff", stroke: "black", "stroke-width": "1" }),
                        FSComponent.buildComponent("g", { "clip-path": "url(#ah-clip)" },
                            FSComponent.buildComponent(GraduationLines, null)))),
                FSComponent.buildComponent(BankSlipIndicator, { bus: this.props.bus }),
                FSComponent.buildComponent(FlightPathVector, { bus: this.props.bus })),
            FSComponent.buildComponent("path", { d: "M0 0, h799, v410 h-260 v-190 a-44,44 -44 0, 0 -44,-44 l-295,0 a-44,44 -44 0, 0 -44,44 v190, H0 Z" }),
            FSComponent.buildComponent("path", { d: "M156 410 v123 a-44,44 -44 0, 0 44,44 h295, a-44,44 -44 0, 0 44,-44 v-123 H800 L800, 800, H0, V410 Z" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M190 377, h84, v30 h-11 v-20 h-73 Z", blackStroke: 5, styleColor: "fill: black;" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M422 377, h84, v11, h-73, v20, h-11 Z", blackStroke: 5, styleColor: "fill: black;" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M163 275, l17 10" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M534 275, l-17 10" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M201 236, l10 10" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M497 236, l-10 10" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M236 189, l15 25" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M462 189, l-15 25" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M278 189, l4 11" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M420 189, l-4 11" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M313 179, l3 13" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M385 179, l-3 13" }),
            FSComponent.buildComponent("path", { fill: "white", stroke: "black", strokeWidth: "0.5", d: "M349 191 l-11 -15 l22 0 Z" }),
            FSComponent.buildComponent(PitchLimitIndicator, { bus: this.props.bus }),
            FSComponent.buildComponent(FlightDirector, { bus: this.props.bus }),
            FSComponent.buildComponent(MarkerBeacon, { bus: this.props.bus }),
            FSComponent.buildComponent("g", { visibility: this.horizonFailVisibility },
                FSComponent.buildComponent("rect", { x: "322", y: "299.5", width: "52", height: "27", class: "line", fill: "none", "stroke-width": "3", stroke: "#ffc400" }),
                FSComponent.buildComponent("text", { x: "348", y: "324", class: "text-3 amber middle" }, "ATT")),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M343 377, h11, v11, h-11, Z", styleBlack: "fill: transparent;", styleColor: "fill: transparent;", blackStroke: 5 })));
    }
}
class BankSlipIndicator extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.bankGroup = FSComponent.createRef();
        this.colour = Subject.create("white");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("roll")
            .withPrecision(2)
            .handle((roll) => {
            this.bankGroup.instance.style.transform = `rotate(${roll}deg)`;
            this.colour.set(Math.abs(roll) > 35 ? "#ffc400" : "white");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { ref: this.bankGroup, class: "horizon-group" },
            FSComponent.buildComponent(SlipIndicator, { bus: this.props.bus, colour: this.colour }),
            FSComponent.buildComponent(BankIndicator, { bus: this.props.bus, colour: this.colour })));
    }
}
class GraduationLines extends DisplayComponent {
    indexToGraduationLineType(i) {
        if (i == 0)
            return "invisible";
        else if (i % 4 == 0)
            return "large";
        else if (!(i % 2 == 0))
            return "small";
        else
            return "half-size";
    }
    render() {
        return (FSComponent.buildComponent("g", { transform: "translate(349, 400)" }, Array.from({ length: 37 }, (_, i) => {
            const number = ((i + 1) / 4) * 10 - 2.5;
            return (FSComponent.buildComponent(FSComponent.Fragment, null,
                FSComponent.buildComponent(GraduationLine, { type: this.indexToGraduationLineType(i), y: i * 20, text: number }),
                FSComponent.buildComponent(GraduationLine, { type: this.indexToGraduationLineType(i), y: i * -20, text: number })));
        })));
    }
}
class GraduationLine extends DisplayComponent {
    getLine(length) {
        const style = `transform: translate(-${length / 2}px, ${this.props.y}px); stroke-linejoin: round;`;
        return FSComponent.buildComponent(BlackOutlineLine, { d: `M0 0,h${length}`, blackStroke: 5, styleColor: `${style} opacity: 0.9;`, styleBlack: style });
    }
    render() {
        var _a, _b;
        switch (this.props.type) {
            case "large":
                return (FSComponent.buildComponent(FSComponent.Fragment, null,
                    this.getLine(164),
                    FSComponent.buildComponent("text", { fillOpacity: 0.9, class: "text-2", x: -88, y: this.props.y + 8.5 }, (_a = this.props.text) === null || _a === void 0 ? void 0 : _a.toString()),
                    FSComponent.buildComponent("text", { fillOpacity: 0.9, class: "text-2", x: 109, y: this.props.y + 8.5 }, (_b = this.props.text) === null || _b === void 0 ? void 0 : _b.toString())));
            case "half-size":
                return this.getLine(82);
            case "small":
                return this.getLine(41);
            default:
                return FSComponent.buildComponent(FSComponent.Fragment, null);
        }
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class VerticalSpeedIndicator extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.bgVisibility = Subject.create("visible");
        this.indicatorVisibility = Subject.create("visible");
        this.indicatorLineD = Subject.create("");
        this.textRef = FSComponent.createRef();
        this.vsFailVisibility = Subject.create("hidden");
    }
    static fpmToPixels(fpm) {
        const seg1 = 0.08 * Math.min(Math.abs(fpm), 1000);
        const seg2 = 0.06 * Math.min(Math.max(Math.abs(fpm) - 1000, 0), 1000);
        const seg3 = 0.01 * Math.max(Math.abs(fpm) - 2000, 0);
        const pixels = fpm > 6000 || fpm < -6000 ? 180 : seg1 + seg2 + seg3;
        return fpm > 0 ? -pixels : pixels;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("irsState")
            .whenChanged()
            .handle((state) => {
            this.bgVisibility.set(state >= 1 ? "visible" : "hidden");
            this.indicatorVisibility.set(state >= 2 ? "visible" : "hidden");
            this.vsFailVisibility.set(state === 0 ? "visible" : "hidden");
        });
        sub.on("verticalSpeed")
            .withPrecision(0)
            .handle((vs) => {
            this.indicatorLineD.set(`M 825 381, l -73 ${VerticalSpeedIndicator.fpmToPixels(vs)}`);
            this.textRef.instance.setAttribute("y", `${vs > 0 ? 170 - 7.33 : 630 - 7.33}`);
            this.textRef.instance.style.visibility = Math.abs(vs) > 400 ? "visible" : "hidden";
            this.textRef.instance.innerHTML = (Math.abs(vs) > 9975 ? 9999 : Math.round(Math.abs(Math.round(vs)) / 50) * 50).toString();
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("path", { class: "gray-bg", d: "M 723 184 h 35 l 34 97 v 200 l -34 97 h -35 v -130 l 20 -10 v -114 l -20 -10 Z", visibility: this.bgVisibility }),
            FSComponent.buildComponent("g", { visibility: this.indicatorVisibility },
                FSComponent.buildComponent(VSIScale, null),
                FSComponent.buildComponent(BlackOutlineLine, { d: this.indicatorLineD, whiteStroke: 5, blackStroke: 6 }),
                FSComponent.buildComponent(SelectedVSBug, { bus: this.props.bus }),
                FSComponent.buildComponent("text", { x: 785, class: "text-3", ref: this.textRef })),
            FSComponent.buildComponent("rect", { x: 792, y: 290, width: 9, height: 190, fill: "black" }),
            FSComponent.buildComponent("g", { visibility: this.vsFailVisibility },
                FSComponent.buildComponent("rect", { x: "751", y: "328", width: "24", height: "103", class: "line", fill: "none", "stroke-width": "3", stroke: "#ffc400" }),
                FSComponent.buildComponent("text", { x: "763", y: "353", class: "text-3 amber middle" }, "V"),
                FSComponent.buildComponent("text", { x: "763", y: "378", class: "text-3 amber middle" }, "E"),
                FSComponent.buildComponent("text", { x: "763", y: "403", class: "text-3 amber middle" }, "R"),
                FSComponent.buildComponent("text", { x: "763", y: "428", class: "text-3 amber middle" }, "T"))));
    }
}
class SelectedVSBug extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.visibility = Subject.create("hidden");
        this.transform = Subject.create("");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("vsActive")
            .whenChanged()
            .handle((active) => this.visibility.set(active ? "visible" : "hidden"));
        // mjøøød det daglige brød
        sub.on("selectedVs")
            .withPrecision(0)
            .handle((vs) => this.transform.set(`translate(0 ${VerticalSpeedIndicator.fpmToPixels(vs)})`));
    }
    render() {
        return (FSComponent.buildComponent("g", { transform: this.transform, visibility: this.visibility },
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 749 383 h 14", color: "#d570ff" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 749 379 h 14", color: "#d570ff" })));
    }
}
class VSIScale extends DisplayComponent {
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { transform: "translate(740.5 209.33)" },
                FSComponent.buildComponent("text", { x: 0, y: 0, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "6"),
                FSComponent.buildComponent("text", { x: 0, y: 40, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "2"),
                FSComponent.buildComponent("text", { x: 0, y: 100, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "1"),
                FSComponent.buildComponent("text", { x: 0, y: 260, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "1"),
                FSComponent.buildComponent("text", { x: 0, y: 320, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "2"),
                FSComponent.buildComponent("text", { x: 0, y: 360, class: "text-2", "fill-opacity": 0.9, "letter-spacing": 1.2 }, "6")),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 201, h 8", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 221, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 241, h 8", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 271, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 301, h 8", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 341, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 381, h 18", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 421, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 461, h 8", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 491, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 521, h 8", whiteStroke: 4, blackStroke: 5 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 541, h 8" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 743 561, h 8", whiteStroke: 4, blackStroke: 5 })));
    }
}

/**
 * Salty 74S
 * Copyright (C) 2021 Salty Simulations and its contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
const getHeadingDelta = (heading1, heading2) => {
    let headingDelta = heading1 - heading2;
    if (headingDelta > 180) {
        headingDelta -= 360;
    }
    else if (headingDelta < -180) {
        headingDelta += 360;
    }
    return headingDelta;
};
const getDriftAngle = (heading, track) => getHeadingDelta(heading, track) * -1;

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class HeadingBug extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.heading = 0;
        this.mcpHeading = 0;
        this.selectedHeadingString = Subject.create("");
        this.bugTransform = Subject.create("");
    }
    setSelectedHeadingString(heading) {
        let hdgString = heading.toFixed(0);
        if (hdgString.length === 2) {
            hdgString = "0" + hdgString;
        }
        else if (hdgString.length === 1) {
            hdgString = "00" + hdgString;
        }
        this.selectedHeadingString.set(hdgString);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("magneticHeading")
            .withPrecision(1)
            .handle((heading) => {
            this.heading = heading;
            this.bugTransform.set(`rotate(${Math.min(-Math.min(getHeadingDelta(this.heading, this.mcpHeading) * 1.6, 55), 55)} 349 ${900 + arcCorrection(heading, this.mcpHeading)})`);
        });
        sub.on("selectedHeading")
            .withPrecision(0)
            .handle((heading) => {
            this.mcpHeading = heading;
            this.bugTransform.set(`rotate(${Math.min(-Math.min(getHeadingDelta(this.heading, this.mcpHeading) * 1.6, 55), 55)} 349 ${900 + arcCorrection(heading, this.mcpHeading)})`);
            this.setSelectedHeadingString(heading);
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("text", { x: "305", y: "777", class: "text-3 magenta" }, this.selectedHeadingString),
            FSComponent.buildComponent("text", { x: "319", y: "777", class: "text-2 magenta" }, "H"),
            FSComponent.buildComponent("g", { transform: this.bugTransform },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M 335 679, h28, v-14, h-4, l-7 14, h-6, l-7 -14, h-4, Z", blackStroke: 5, color: "#d570ff" }))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class TrackLine extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.heading = 0;
        this.track = 0;
        this.trackLineTransform = Subject.create("");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("magneticHeading")
            .withPrecision(1)
            .handle((heading) => {
            this.heading = heading;
            this.trackLineTransform.set(`rotate(${getHeadingDelta(this.heading, this.heading - getDriftAngle(this.heading, this.track)) * 1.6} 349 ${900 + arcCorrection(this.heading, this.heading - getDriftAngle(this.heading, this.track))})`);
        });
        sub.on("magneticTrack")
            .withPrecision(1)
            .handle((track) => {
            this.track = track;
            this.trackLineTransform.set(`rotate(${getHeadingDelta(this.heading, this.heading - getDriftAngle(this.heading, this.track)) * 1.6} 349 ${900 + arcCorrection(this.heading, this.heading - getDriftAngle(this.heading, this.track))})`);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { transform: this.trackLineTransform },
            FSComponent.buildComponent("path", { class: "line", stroke: "black", "stroke-width": "5", d: "M349 680, v150" }),
            FSComponent.buildComponent("path", { class: "line", stroke: "black", "stroke-width": "5", d: "M343 751, h12" }),
            FSComponent.buildComponent("path", { class: "line", stroke: "white", "stroke-width": "3", d: "M349 680, v150" }),
            FSComponent.buildComponent("path", { class: "line", stroke: "white", "stroke-width": "3", d: "M343 751, h12" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const arcCorrection = (heading, indicatorHeading) => Math.min(Math.abs(getHeadingDelta(heading, indicatorHeading) * 100), 30);
class HeadingDisplay extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.visibilityAligning = Subject.create("visible");
        this.visibilityAligned = Subject.create("visible");
        this.hdgFailVisibility = Subject.create("hidden");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("irsState")
            .whenChanged()
            .handle((state) => {
            this.visibilityAligning.set(state >= 1 ? "visible" : "hidden");
            this.visibilityAligned.set(state === 2 ? "visible" : "hidden");
            this.hdgFailVisibility.set(state === 0 ? "visible" : "hidden");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { visibility: this.visibilityAligning },
                FSComponent.buildComponent("path", { class: "gray-bg", d: "M142 785, h412, c -103 -140, -306 -140, -412 0 Z" }),
                FSComponent.buildComponent(BlackOutlineLine, { d: "M349 677 l-11 -20 l22 0 Z", blackStroke: 6, whiteStroke: 4 }),
                FSComponent.buildComponent(HeadingLines, { bus: this.props.bus }),
                FSComponent.buildComponent("text", { x: "435", y: "777", class: "text-2 green" }, "MAG")),
            FSComponent.buildComponent("g", { visibility: this.visibilityAligned },
                FSComponent.buildComponent(HeadingBug, { bus: this.props.bus }),
                FSComponent.buildComponent(TrackLine, { bus: this.props.bus })),
            FSComponent.buildComponent("rect", { x: "200", y: "785", width: "300", height: "5", fill: "black" }),
            FSComponent.buildComponent("rect", { x: "110", y: "789", width: "480", height: "15", fill: "black" }),
            FSComponent.buildComponent("g", { visibility: this.hdgFailVisibility },
                FSComponent.buildComponent("rect", { x: "322", y: "749.5", width: "52", height: "27", class: "line", fill: "none", "stroke-width": "3", stroke: "#ffc400" }),
                FSComponent.buildComponent("text", { x: "348", y: "774", class: "text-3 amber middle" }, "HDG"))));
    }
}
class HeadingLineElement extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.transform = Subject.create("");
        this.visibility = Subject.create("visible");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("magneticHeading")
            .withPrecision(1)
            .handle((heading) => {
            this.transform.set(`rotate(${-getHeadingDelta(heading, this.props.rotation) * 1.6} 349 ${900 + arcCorrection(heading * 10, this.props.rotation)})`);
        });
        sub.on("irsState")
            .whenChanged()
            .handle((state) => this.visibility.set(state === 2 ? "visible" : "hidden"));
    }
    render() {
        return (FSComponent.buildComponent("g", { transform: this.transform },
            FSComponent.buildComponent(BlackOutlineLine, { d: `M349 680.5, v${this.props.text ? 11 : 5.5}` }),
            this.props.text && (FSComponent.buildComponent("text", { x: "349", y: this.props.rotation % 3 === 0 ? 718 : 712, class: `${this.props.rotation % 3 === 0 ? "text-3" : "text-2"} middle`, "fill-opacity": `${this.props.rotation % 3 === 0 ? "1" : "0.9"}`, visibility: this.visibility }, this.props.rotation == 360 ? "0" : (this.props.rotation / 10).toString()))));
    }
}
class HeadingLines extends DisplayComponent {
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null, Array.from({ length: 36 }, (_, i) => {
            const rotation = (i + 1) * 10;
            return (FSComponent.buildComponent(FSComponent.Fragment, null,
                FSComponent.buildComponent(HeadingLineElement, { bus: this.props.bus, rotation: rotation, text: true }),
                FSComponent.buildComponent(HeadingLineElement, { bus: this.props.bus, rotation: rotation - 5 })));
        })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class AirspeedScroller extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.hundredsTransform = Subject.create("");
        this.tensTransform = Subject.create(`translate(0 ${this.getTensScrollerY(30)})`);
        this.digitTransform = Subject.create(`translate(0 ${this.getDigitScrollerY(30)})`);
    }
    getHundredsScrollerY(airspeed) {
        let scroll = Math.floor(airspeed / 100) * 49;
        if (Math.floor(airspeed).toString().slice(-1) === "9" && Math.floor(airspeed).toString().slice(-2, -1) === "9") {
            let speedOver99Int = Math.round(airspeed / 100) * 100 - 1 - airspeed;
            scroll = scroll + -speedOver99Int * 49;
        }
        return scroll;
    }
    getTensScrollerY(airspeed) {
        const value = Math.max(airspeed, 30) % 100;
        let scroll = Math.floor(value / 10) * 49;
        if (Math.floor(value).toString().slice(-1) === "9") {
            const speedOver9Int = Math.round(value / 10) * 10 - 1 - value;
            scroll = scroll + -speedOver9Int * 49;
        }
        return scroll;
    }
    getDigitScrollerY(airspeed) {
        return ((Math.max(airspeed, 30) % 100) % 10) * 33;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.hundredsTransform.set(`translate(0 ${this.getHundredsScrollerY(airspeed)})`);
            this.tensTransform.set(`translate(0 ${this.getTensScrollerY(airspeed)})`);
            this.digitTransform.set(`translate(0 ${this.getDigitScrollerY(airspeed)})`);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent(ScrollerBox, { bus: this.props.bus }),
            FSComponent.buildComponent("clipPath", { id: "asi-clip" },
                FSComponent.buildComponent("path", { d: "M 14 348, h64, v65, h-64 Z" })),
            FSComponent.buildComponent("g", { class: "text-4", "clip-path": "url(#asi-clip)" },
                FSComponent.buildComponent("g", { transform: this.hundredsTransform }, Array.from({ length: 5 }, (_, i) => (FSComponent.buildComponent("text", { x: "35", y: 200 + 49 * i }, (i == 4 ? "" : 4 - i).toString())))),
                FSComponent.buildComponent("g", { transform: this.tensTransform },
                    Array.from({ length: 10 }, (_, i) => (FSComponent.buildComponent("text", { x: "56", y: -45 + 49 * i }, (9 - i).toString()))),
                    FSComponent.buildComponent("text", { x: "57", y: "-94" }, "0")),
                FSComponent.buildComponent("g", { transform: this.digitTransform },
                    Array.from({ length: 10 }, (_, i) => (FSComponent.buildComponent("text", { x: "77", y: 99 + 33 * i }, (9 - i).toString()))),
                    FSComponent.buildComponent("text", { x: "77", y: "33" }, "1"),
                    FSComponent.buildComponent("text", { x: "77", y: "66" }, "0"),
                    FSComponent.buildComponent("text", { x: "77", y: "99" }, "9"),
                    FSComponent.buildComponent("text", { x: "77", y: "429" }, "9")))));
    }
}
class ScrollerBox extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.maneuveringSpeed = 0;
        this.radioHeight = 0;
        this.strokeWidth = Subject.create(3);
        this.colour = Subject.create("white");
    }
    handleLowAirspeedIndication() {
        this.strokeWidth.set(Math.max(this.airspeed, 30) < this.maneuveringSpeed && this.radioHeight > 25 ? 9 : 3);
        this.colour.set(Math.max(this.airspeed, 30) < this.maneuveringSpeed && this.radioHeight > 25 ? "#ffc400" : "white");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.handleLowAirspeedIndication();
        });
        sub.on("maneuveringSpeed")
            .whenChangedBy(0.25)
            .handle((manSpeed) => {
            this.maneuveringSpeed = manSpeed;
            this.handleLowAirspeedIndication();
        });
        sub.on("altAboveGround")
            .withPrecision(1)
            .handle((height) => {
            this.radioHeight = height;
            this.handleLowAirspeedIndication();
        });
    }
    render() {
        return (FSComponent.buildComponent(BlackOutlineLine, { d: "M 10 342 h 72 v 28 l 14 11 l -14 11 v 28 h -72 Z", blackStroke: 5, whiteStroke: this.strokeWidth, color: this.colour }));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class VSpeedBugs extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.radioHeight = 0;
        this.flightPhase = 0;
        this.airspeed = 0;
        this.v1 = 0;
        this.vR = 0;
        this.v2 = 0;
        this.v1Visibility = Subject.create("hidden");
        this.vRVisibility = Subject.create("hidden");
        this.v2Visibility = Subject.create("hidden");
        this.v1D = Subject.create("");
        this.vRD = Subject.create("");
        this.v2D = Subject.create("");
        this.v1Y = Subject.create(0);
        this.vRY = Subject.create(0);
        this.v2Y = Subject.create(0);
        this.vRBugText = Subject.create("");
    }
    handleVSpeedVisibility() {
        this.v1Visibility.set(this.radioHeight < 25 && this.flightPhase <= 2 && this.v1 != 0 ? "visible" : "hidden");
        this.vRVisibility.set(this.radioHeight < 25 && this.flightPhase <= 2 && this.vR != 0 ? "visible" : "hidden");
        this.v2Visibility.set(this.flightPhase <= 2 && this.v2 != 0 ? "visible" : "hidden");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altAboveGround")
            .withPrecision(1)
            .handle((height) => {
            this.radioHeight = height;
            this.handleVSpeedVisibility();
        });
        sub.on("flightPhase")
            .whenChanged()
            .handle((phase) => {
            this.flightPhase = phase;
            this.handleVSpeedVisibility();
        });
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.v1Y.set(Math.max(529 + this.v1 * -4.6, 520 + (Math.max(this.airspeed, 30) + 54) * -4.6));
        });
        sub.on("v1")
            .whenChanged()
            .handle((v1) => {
            this.v1 = v1;
            this.v1D.set(`M 45 ${520 + v1 * -4.6}, h20`);
            this.v1Y.set(Math.max(529 + v1 * -4.6, 520 + (Math.max(this.airspeed, 30) + 54) * -4.6));
            this.vRBugText.set(this.vR - this.v1 < 4 ? "R" : "VR");
            this.handleVSpeedVisibility();
        });
        sub.on("vR")
            .whenChanged()
            .handle((vR) => {
            this.vR = vR;
            this.vRD.set(`M 55 ${520 + vR * -4.6}, h10`);
            this.vRY.set(529 + vR * -4.6);
            this.vRBugText.set(this.vR - this.v1 < 4 ? "R" : "VR");
            this.handleVSpeedVisibility();
        });
        sub.on("v2")
            .whenChanged()
            .handle((v2) => {
            this.v2 = v2;
            this.v2D.set(`M 55 ${520 + v2 * -4.6}, h10`);
            this.v2Y.set(529 + v2 * -4.6);
            this.handleVSpeedVisibility();
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("g", { visibility: this.v1Visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.v1D, blackStroke: 6, whiteStroke: 5, color: "lime" }),
                FSComponent.buildComponent("text", { x: "93", y: this.v1Y, class: "text-2 green" }, "V1")),
            FSComponent.buildComponent("g", { visibility: this.vRVisibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.vRD, blackStroke: 6, whiteStroke: 5, color: "lime" }),
                FSComponent.buildComponent("text", { x: "105", y: this.vRY, class: "text-2 green" }, this.vRBugText)),
            FSComponent.buildComponent("g", { visibility: this.v2Visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.v2D, blackStroke: 6, whiteStroke: 5, color: "lime" }),
                FSComponent.buildComponent("text", { x: "93", y: this.v2Y, class: "text-2 green" }, "V2"))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class FlapSpeedBugs extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.radioHeight = 0;
        this.flightPhase = 0;
        this.selectedFlaps = 0;
        this.vRef25 = 0;
        this.vRef30 = 0;
        this.landingFlaps = 0;
        this.visibility = Subject.create("hidden");
        this.currentFlapSpeedBugD = Subject.create("");
        this.currentFlapSpeedBugY = Subject.create(0);
        this.currentFlapSpeedBugText = Subject.create("");
        this.nextFlapSpeedBugD = Subject.create("");
        this.nextFlapSpeedBugY = Subject.create(0);
        this.nextFlapSpeedBugText = Subject.create("");
        this.flapMarkerText = ["UP", "1\xa0", "5\xa0", "10", "20", "25"];
        this.flapMarkerSpeed = [80, 60, 40, 20, 10];
    }
    currentFlapMarkerSpeed(flapsHandle, vRef30, vRef25, landingFlaps) {
        if (flapsHandle === 5 && landingFlaps !== 25)
            return vRef25;
        return flapsHandle > 5 || (flapsHandle === 5 && landingFlaps === 25) ? -1 : vRef30 + this.flapMarkerSpeed[flapsHandle];
    }
    nextFlapMarkerSpeed(flapsHandle, vRef30, landingFlaps) {
        if (flapsHandle === 5 && landingFlaps !== 25)
            return vRef30 + 10;
        return flapsHandle > 5 || flapsHandle < 1 || (flapsHandle === 5 && landingFlaps === 25) ? -1 : vRef30 + this.flapMarkerSpeed[flapsHandle - 1];
    }
    handleFlapsBugs() {
        this.currentFlapSpeedBugD.set(`M 55 ${520 + this.currentFlapMarkerSpeed(this.selectedFlaps, this.vRef30, this.vRef25, this.landingFlaps) * -4.6}, h10`);
        this.currentFlapSpeedBugY.set(529 + this.currentFlapMarkerSpeed(this.selectedFlaps, this.vRef30, this.vRef25, this.landingFlaps) * -4.6);
        this.nextFlapSpeedBugD.set(`M 55 ${520 + this.nextFlapMarkerSpeed(this.selectedFlaps, this.vRef30, this.landingFlaps) * -4.6}, h10`);
        this.nextFlapSpeedBugY.set(529 + this.nextFlapMarkerSpeed(this.selectedFlaps, this.vRef30, this.landingFlaps) * -4.6);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altAboveGround")
            .withPrecision(1)
            .handle((height) => {
            this.radioHeight = height;
            this.visibility.set(this.flightPhase >= 2 && this.radioHeight > 25 && this.radioHeight < 20000 ? "visible" : "hidden");
        });
        sub.on("onGround")
            .whenChanged()
            .handle((_) => {
            this.currentFlapSpeedBugText.set(this.selectedFlaps <= 5 ? this.flapMarkerText[this.selectedFlaps] : "");
            this.nextFlapSpeedBugText.set(this.selectedFlaps < 1 || (this.selectedFlaps === 5 && this.landingFlaps === 25) || this.selectedFlaps > 5
                ? ""
                : this.flapMarkerText[this.selectedFlaps - 1]);
        });
        sub.on("flightPhase")
            .whenChanged()
            .handle((phase) => {
            this.flightPhase = phase;
            this.visibility.set(this.flightPhase >= 2 && this.radioHeight > 25 ? "visible" : "hidden");
        });
        sub.on("flapsHandle")
            .whenChanged()
            .handle((flaps) => {
            this.selectedFlaps = flaps;
            this.handleFlapsBugs();
            this.currentFlapSpeedBugText.set(flaps <= 5 ? this.flapMarkerText[flaps] : "");
            this.nextFlapSpeedBugText.set(flaps < 1 || (flaps === 5 && this.landingFlaps === 25) || flaps > 5 ? "" : this.flapMarkerText[flaps - 1]);
        });
        sub.on("vRef25")
            .whenChanged()
            .handle((vRef25) => {
            this.vRef25 = vRef25;
            this.handleFlapsBugs();
        });
        sub.on("vRef30")
            .whenChanged()
            .handle((vRef30) => {
            this.vRef30 = vRef30;
            this.handleFlapsBugs();
        });
        sub.on("landingFlaps")
            .whenChanged()
            .handle((flaps) => {
            this.landingFlaps = flaps;
            this.handleFlapsBugs();
            this.nextFlapSpeedBugText.set(flaps < 1 || (flaps === 5 && this.landingFlaps === 25) || flaps > 5 ? "" : this.flapMarkerText[flaps - 1]);
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("g", { visibility: this.visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.currentFlapSpeedBugD, blackStroke: 6, whiteStroke: 5, color: "lime" }),
                FSComponent.buildComponent("text", { x: "93", y: this.currentFlapSpeedBugY, class: "text-2 green" }, this.currentFlapSpeedBugText)),
            FSComponent.buildComponent("g", { visibility: this.visibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.nextFlapSpeedBugD, blackStroke: 6, whiteStroke: 5, color: "lime" }),
                FSComponent.buildComponent("text", { x: "93", y: this.nextFlapSpeedBugY, class: "text-2 green" }, this.nextFlapSpeedBugText))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class RefSpeedBugs extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.vRef = 0;
        this.bugVisibility = Subject.create("hidden");
        this.bugLineVisibility = Subject.create("hidden");
        this.bugY = Subject.create(0);
        this.bugLineD = Subject.create("");
    }
    handleRefBug() {
        this.bugVisibility.set(this.vRef != 0 && Math.max(this.airspeed, 30) - this.vRef < 52.5 ? "visible" : "hidden");
        this.bugY.set(Math.min(529 + this.vRef * -4.6, 529 + (Math.max(this.airspeed, 30) - 52.5) * -4.6));
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.handleRefBug();
        });
        sub.on("vRef")
            .whenChanged()
            .handle((vRef) => {
            this.vRef = vRef;
            this.handleRefBug();
            this.bugLineVisibility.set(this.vRef != 0 ? "visible" : "hidden");
            this.bugLineD.set(`M 45 ${520 + this.vRef * -4.6}, h20`);
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("g", { visibility: this.bugLineVisibility },
                FSComponent.buildComponent("text", { x: "71", y: this.bugY, class: "text-2 green start" }, "REF")),
            FSComponent.buildComponent("g", { visibility: this.bugLineVisibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: this.bugLineD, blackStroke: 6, whiteStroke: 5, color: "lime" }))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class SpeedBugs extends DisplayComponent {
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent(VSpeedBugs, { bus: this.props.bus }),
            FSComponent.buildComponent(FlapSpeedBugs, { bus: this.props.bus }),
            FSComponent.buildComponent(RefSpeedBugs, { bus: this.props.bus }),
            FSComponent.buildComponent(SelectedSpeedBug, { bus: this.props.bus })));
    }
}
class SelectedSpeedBug extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.selectedSpeed = 0;
        this.d = Subject.create("");
    }
    handleSpeedBug() {
        this.d.set(`M 49 ${Math.max(520 + (Math.max(this.airspeed, 30) + 61.5) * -4.6, Math.min(520 + this.selectedSpeed * -4.6, 520 + (Math.max(this.airspeed, 30) - 60.5) * -4.6))}, l 15 11.5, h32, v-23, h-32, Z`);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((speed) => {
            this.airspeed = speed;
            this.handleSpeedBug();
        });
        sub.on("selectedSpeed")
            .whenChanged()
            .handle((speed) => {
            this.selectedSpeed = speed;
            this.handleSpeedBug();
        });
    }
    render() {
        return FSComponent.buildComponent(BlackOutlineLine, { d: this.d, color: "#d570ff", blackStroke: 5, styleBlack: "fill: none;", styleColor: "fill: none;" });
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class ValuePreviews extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.vRef = 0;
        this.v1 = 0;
        this.landingFlaps = 0;
        this.flightPhase = 0;
        this.refTextVisibility = Subject.create("hidden");
        this.refValuePreviewVisibility = Subject.create("hidden");
        this.refValuePreview = Subject.create("");
        this.v1PreviewVisibility = Subject.create("hidden");
        this.v1PreviewText = Subject.create(0);
    }
    refValueText(vRef, landingFlaps) {
        if (vRef) {
            switch (landingFlaps) {
                case 20:
                    return `--/${vRef.toString()}`;
                case 25:
                    return `25/${vRef.toString()}`;
                case 30:
                    return `30/${vRef.toString()}`;
            }
        }
        return "";
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("flightPhase")
            .whenChanged()
            .handle((phase) => {
            this.flightPhase = phase;
            this.v1PreviewVisibility.set(this.v1 - Math.max(this.airspeed, 30) > 55 && this.flightPhase <= 2 ? "visible" : "hidden");
        });
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.v1PreviewVisibility.set(this.v1 - Math.max(this.airspeed, 30) > 55 && this.flightPhase <= 2 ? "visible" : "hidden");
            this.refValuePreviewVisibility.set(Math.max(this.airspeed, 30) - this.vRef > 52.5 && this.vRef != 0 ? "visible" : "hidden");
        });
        sub.on("v1")
            .whenChanged()
            .handle((v1) => {
            this.v1 = v1;
            this.v1PreviewText.set(v1);
            this.v1PreviewVisibility.set(this.v1 - Math.max(this.airspeed, 30) > 55 && this.flightPhase <= 2 ? "visible" : "hidden");
        });
        sub.on("vRef")
            .whenChanged()
            .handle((vRef) => {
            this.vRef = vRef;
            this.refTextVisibility.set(this.vRef != 0 ? "visible" : "hidden");
            this.refValuePreview.set(this.refValueText(this.vRef, this.landingFlaps));
            this.refValuePreviewVisibility.set(Math.max(this.airspeed, 30) - this.vRef > 52.5 && this.vRef != 0 ? "visible" : "hidden");
        });
        sub.on("landingFlaps")
            .whenChanged()
            .handle((flaps) => {
            this.landingFlaps = flaps;
            this.refValuePreview.set(this.refValueText(this.vRef, this.landingFlaps));
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("text", { visibility: this.v1PreviewVisibility, x: "155", y: 155, class: "text-2 green" }, this.v1PreviewText),
            FSComponent.buildComponent("text", { x: "121", y: 632, class: "text-2 green start", visibility: this.refValuePreviewVisibility }, "REF"),
            FSComponent.buildComponent("text", { x: "121", y: 654, class: "text-2 green start", visibility: this.refTextVisibility }, this.refValuePreview)));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class SpeedBands extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.airspeed = 0;
        this.maneuveringSpeed = 0;
        this.maxSpeed = 0;
        this.minSpeed = 0;
        this.onGround = false;
        this.takeoffFlaps = 0;
        this.actualFlapAngle = 0;
        this.maneuveringSpeedBandVisibility = Subject.create("hidden");
        this.minMaxSpeedBandVisibility = Subject.create("hidden");
        this.maneuveringSpeedBandTransform = Subject.create("");
        this.minimumSpeedBandTransform = Subject.create("");
        this.maximumSpeedBandTransform = Subject.create("");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("onGround")
            .whenChanged()
            .handle((onGround) => {
            this.onGround = onGround;
            this.minMaxSpeedBandVisibility.set(!onGround ? "visible" : "hidden");
            this.maneuveringSpeedBandVisibility.set(!this.onGround && this.takeoffFlaps !== this.actualFlapAngle ? "visible" : "hidden");
        });
        sub.on("takeoffFlaps")
            .whenChanged()
            .handle((flaps) => {
            this.takeoffFlaps = flaps;
            this.maneuveringSpeedBandVisibility.set(!this.onGround && this.takeoffFlaps !== this.actualFlapAngle ? "visible" : "hidden");
        });
        sub.on("actualFlapAngle")
            .whenChanged()
            .handle((angle) => {
            this.actualFlapAngle = angle;
            this.maneuveringSpeedBandVisibility.set(!this.onGround && this.takeoffFlaps !== this.actualFlapAngle ? "visible" : "hidden");
        });
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((speed) => {
            this.airspeed = speed;
            this.maneuveringSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.maneuveringSpeed) * 4.6})`);
            this.maximumSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.maxSpeed) * 4.6})`);
            this.minimumSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.minSpeed) * 4.6})`);
        });
        sub.on("maneuveringSpeed")
            .whenChangedBy(0.25)
            .handle((speed) => {
            this.maneuveringSpeed = speed;
            this.maneuveringSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.maneuveringSpeed) * 4.6})`);
        });
        sub.on("maxSpeed")
            .withPrecision(0)
            .handle((speed) => {
            this.maxSpeed = speed;
            this.maximumSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.maxSpeed) * 4.6})`);
        });
        sub.on("minSpeed")
            .withPrecision(0)
            .handle((speed) => {
            this.minSpeed = speed;
            this.minimumSpeedBandTransform.set(`translate(50 ${(Math.max(this.airspeed, 30) - this.minSpeed) * 4.6})`);
        });
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent("g", { visibility: this.maneuveringSpeedBandVisibility, transform: this.maneuveringSpeedBandTransform },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M 62 382, h7, v 1800", color: "#ffc400", blackStroke: 5 })),
            FSComponent.buildComponent("g", { visibility: this.minMaxSpeedBandVisibility, transform: this.maximumSpeedBandTransform },
                FSComponent.buildComponent("path", { class: "red-band", d: "M 67 -1826, v 2209" })),
            FSComponent.buildComponent("g", { visibility: this.minMaxSpeedBandVisibility, transform: this.minimumSpeedBandTransform },
                FSComponent.buildComponent("path", { d: "M 63 382, h9, v 1800, h-9, Z", fill: "black" }),
                FSComponent.buildComponent("path", { class: "red-band", d: "M 67 382, v 1800", fill: "none" }))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
//TODO: this should also include some component based on airspeed change vs delta time, not just acceleration
class SpeedTrendVector extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.acceleration = 0;
        this.airspeed = 0;
        this.visibility = Subject.create("hidden");
        this.d = Subject.create("");
    }
    getTrendVector(acceleration, airspeed) {
        if (airspeed < 30)
            return 0;
        return acceleration > 0 ? Math.min(acceleration * 5.925, 60.5) : Math.max(acceleration * 5.925, -60.5);
    }
    handleTrendVector() {
        this.visibility.set(Math.abs(this.getTrendVector(this.acceleration, this.airspeed)) < 4.5 ? "hidden" : "visible");
        this.d.set(`M 96 381, v${this.getTrendVector(this.acceleration, this.airspeed) * -4.6 - (this.acceleration > 0 ? -12 : 12)}, m-6 0, h12, m0 0, l-6 ${this.acceleration > 0 ? "-" : ""}12, m0 0, l-6 ${this.acceleration < 0 ? "-" : ""}12`);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("acceleration")
            .withPrecision(1)
            .handle((acceleration) => {
            this.acceleration = acceleration / 60;
            this.handleTrendVector();
        });
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((airspeed) => {
            this.airspeed = airspeed;
            this.handleTrendVector();
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { visibility: this.visibility },
            FSComponent.buildComponent(BlackOutlineLine, { d: this.d, color: "lime", blackStroke: 5, styleBlack: "fill: none;", styleColor: "fill: none;" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class SpeedTape extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.transform = Subject.create("translate(50 0)");
        this.noVSpeed = Subject.create("hidden");
    }
    airspeedY(airspeed) {
        return Math.max(airspeed - 30, 0) * 4.6;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("airspeed")
            .whenChangedBy(0.0625)
            .handle((speed) => {
            this.transform.set(`translate(50 ${this.airspeedY(Math.max(speed, 30))})`);
        });
        sub.on("v1")
            .whenChanged()
            .handle((v1) => this.noVSpeed.set(v1 == 0 ? "visible" : "hidden"));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { visibility: this.noVSpeed },
                FSComponent.buildComponent("text", { x: "135", y: "238", class: "text-3 amber middle" }, "NO"),
                FSComponent.buildComponent("text", { x: "135", y: "270", class: "text-3 amber middle" }, "V"),
                FSComponent.buildComponent("text", { x: "135", y: "302", class: "text-3 amber middle" }, "S"),
                FSComponent.buildComponent("text", { x: "135", y: "327", class: "text-3 amber middle" }, "P"),
                FSComponent.buildComponent("text", { x: "135", y: "352", class: "text-3 amber middle" }, "D")),
            FSComponent.buildComponent("path", { class: "gray-bg", d: "M13 100, h100 v560 h -100 Z" }),
            FSComponent.buildComponent("clipPath", { id: "speedtape-clip" },
                FSComponent.buildComponent("path", { d: "M13 100, h200 v560 h -200 Z" })),
            FSComponent.buildComponent("g", { "clip-path": "url(#speedtape-clip)" },
                FSComponent.buildComponent("g", { transform: this.transform },
                    Array.from({ length: 40 }, (_, i) => (FSComponent.buildComponent(BlackOutlineLine, { d: `M47 ${i * -46 + 382}, h15` }))),
                    Array.from({ length: 21 }, (_, i) => (FSComponent.buildComponent("text", { x: "32", y: i * -92 + 428 + 11, class: "text-3 white", "fill-opacity": 0.9, "letter-spacing": -0.5 }, i === 0 ? "" : ((i + 1) * 20).toFixed(0)))),
                    FSComponent.buildComponent(SpeedBugs, { bus: this.props.bus })),
                FSComponent.buildComponent(SpeedBands, { bus: this.props.bus })),
            FSComponent.buildComponent(ValuePreviews, { bus: this.props.bus }),
            FSComponent.buildComponent("path", { class: "gray-bg", d: "M 14 332, h 71, v 100, h -71, Z" }),
            FSComponent.buildComponent(CommandSpeed, { bus: this.props.bus }),
            FSComponent.buildComponent(MachGS, { bus: this.props.bus }),
            FSComponent.buildComponent(SpeedTrendVector, { bus: this.props.bus })));
    }
}
class CommandSpeed extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.selectedSpeed = 0;
        this.machSpeed = 0;
        this.isInMach = false;
        this.textContent = Subject.create("");
    }
    handleCommandSpeed() {
        this.textContent.set(this.isInMach ? this.machSpeed.toFixed(3).replace("0", "") : this.selectedSpeed.toFixed(0));
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("selectedSpeed")
            .whenChangedBy(0.0625)
            .handle((speed) => {
            this.selectedSpeed = speed;
            this.handleCommandSpeed();
        });
        sub.on("selectedMachSpeed")
            .whenChanged()
            .handle((speed) => {
            this.machSpeed = speed;
            this.handleCommandSpeed();
        });
        sub.on("isInMach")
            .whenChanged()
            .handle((isInMach) => {
            this.isInMach = isInMach;
            this.handleCommandSpeed();
        });
    }
    render() {
        return (FSComponent.buildComponent("text", { x: "105", y: "80", class: "text-4 magenta" }, this.textContent));
    }
}
class MachGS extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.machVisibility = Subject.create("hidden");
        this.gsVisibility = Subject.create("visible");
        this.machText = Subject.create(".000");
        this.gsText = Subject.create("0");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("machSpeed")
            .whenChangedBy(0.002)
            .handle((mach) => {
            this.machVisibility.set(mach >= 0.4 ? "visible" : "hidden");
            this.gsVisibility.set(mach < 0.4 ? "visible" : "hidden");
            this.machText.set(mach.toFixed(3).replace("0", ""));
        });
        sub.on("groundSpeed")
            .whenChangedBy(0.125)
            .handle((gs) => this.gsText.set(Math.round(gs).toString()));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("text", { x: "100", y: "730", class: "text-4", visibility: this.machVisibility }, this.machText),
            FSComponent.buildComponent("g", { visibility: this.gsVisibility },
                FSComponent.buildComponent("text", { x: "46", y: "730", class: "text-3" }, "GS"),
                FSComponent.buildComponent("text", { x: "110", y: "730", class: "text-4" }, this.gsText))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class AltitudeScroller extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.tenThousandsTransform = Subject.create("");
        this.thousandsTransform = Subject.create("");
        this.hundredsTransform = Subject.create("");
        this.twentiesTransform = Subject.create("");
        this.boxColor = Subject.create("white");
        this.boxStroke = Subject.create(3);
    }
    getTenThousandsScrollerY(altitude) {
        let scroll = Math.floor(altitude / 10000) * 49;
        if (Math.floor(altitude).toString().slice(-4, -1) == "998" || Math.floor(altitude).toString().slice(-4, -1) == "999") {
            const altOver9980 = Math.round(altitude / 10000) * 10000 - 20 - altitude;
            scroll = scroll - altOver9980 * (altitude >= 0 ? 2.45 : -2.45);
        }
        return scroll;
    }
    getThousandsScrollerY(altitude) {
        const value = altitude % 10000;
        let scroll = altitude >= 0 ? Math.floor(value / 1000) * 49 : Math.ceil(value / 1000) * -49;
        if (Math.floor(value).toString().slice(-3, -1) == "98" || Math.floor(value).toString().slice(-3, -1) == "99") {
            const altOver9980 = Math.round(value / 1000) * 1000 - 20 - value;
            scroll = scroll - altOver9980 * (altitude >= 0 ? 2.45 : -2.45);
        }
        return scroll;
    }
    getHundredsScrollerY(altitude) {
        const value = altitude % 1000;
        let scroll = altitude >= 0 ? Math.floor(value / 100) * 49 : Math.ceil(value / 100) * -49;
        if (Math.floor(value).toString().slice(-2, -1) == "8" || Math.floor(value).toString().slice(-2, -1) == "9") {
            const altOver80 = Math.round(value / 100) * 100 - 20 - value;
            scroll = scroll - altOver80 * (altitude >= 0 ? 2.45 : -2.45);
        }
        return scroll;
    }
    getTwentiesScrollerY(altitude) {
        const value = altitude % 100;
        return altitude >= 0 ? value * 1.3 : -value * 1.3;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.tenThousandsTransform.set(`translate(0 ${this.getTenThousandsScrollerY(altitude)})`);
            this.thousandsTransform.set(`translate(0 ${this.getThousandsScrollerY(altitude)})`);
            this.hundredsTransform.set(`translate(0 ${this.getHundredsScrollerY(altitude)})`);
            this.twentiesTransform.set(`translate(0 ${this.getTwentiesScrollerY(altitude)})`);
        });
        sub.on("altAlertStatus")
            .whenChanged()
            .handle((status) => {
            this.boxColor.set(status != 2 ? "white" : "#ffc400");
            this.boxStroke.set(status != 0 ? 9 : 3);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent(BlackOutlineLine, { d: "M 632 342 h 104 v 78 h -104 v -28 l -14 -11 l 14 -11 Z", blackStroke: 5, whiteStroke: this.boxStroke, color: this.boxColor }),
            FSComponent.buildComponent("clipPath", { id: "alt-clip" },
                FSComponent.buildComponent("path", { d: "M 632 350 h 104 v 62 h -104 Z" })),
            FSComponent.buildComponent("g", { "clip-path": "url(#alt-clip)" },
                FSComponent.buildComponent("g", { transform: this.tenThousandsTransform },
                    Array.from({ length: 6 }, (_, i) => (FSComponent.buildComponent("text", { class: i === 5 ? "tenk-marker" : "text-4", x: i === 5 ? 658 : 659, y: i === 5 ? 396 : 151 + 49 * i }, i == 5 ? "@" : (5 - i).toString()))),
                    FSComponent.buildComponent("text", { class: "text-4", x: "659", y: "445" }, "-")),
                FSComponent.buildComponent("g", { class: "text-4", transform: this.thousandsTransform },
                    Array.from({ length: 10 }, (_, i) => (FSComponent.buildComponent("text", { x: "681", y: -45 + 49 * i }, (9 - i).toString()))),
                    FSComponent.buildComponent("text", { x: "681", y: "-94" }, "0")),
                FSComponent.buildComponent("g", { class: "text-3", transform: this.hundredsTransform },
                    Array.from({ length: 10 }, (_, i) => (FSComponent.buildComponent("text", { x: "700", y: -49 + 49 * i }, (9 - i).toString()))),
                    FSComponent.buildComponent("text", { x: "700", y: "-147" }, "1"),
                    FSComponent.buildComponent("text", { x: "700", y: "-98" }, "0"),
                    FSComponent.buildComponent("text", { x: "700", y: "439" }, "9")),
                FSComponent.buildComponent("g", { class: "text-3", transform: this.twentiesTransform },
                    Array.from({ length: 5 }, (_, i) => {
                        const text = (((9 - i) * 20) % 100).toFixed(0);
                        return (FSComponent.buildComponent("text", { x: "732", y: 26 * i + 288 }, text === "0" ? "00" : text));
                    }),
                    FSComponent.buildComponent("text", { x: "732", y: "236" }, "20"),
                    FSComponent.buildComponent("text", { x: "732", y: "262" }, "00"),
                    FSComponent.buildComponent("text", { x: "732", y: "418" }, "80")))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class MetresDisplay extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.isMetresOn = false;
        this.visibility = Subject.create("hidden");
        this.metresText = Subject.create(0);
        this.selectedMetresText = Subject.create(0);
    }
    feetToMeters(feet) {
        return Math.round(feet * 0.3048);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("isMetresOn")
            .whenChanged()
            .handle((isMetresOn) => {
            this.isMetresOn = isMetresOn;
            this.visibility.set(isMetresOn ? "visible" : "hidden");
        });
        sub.on("altitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.metresText.set(this.feetToMeters(altitude));
        });
        sub.on("selectedAltitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.selectedMetresText.set(this.feetToMeters(altitude));
        });
        const hEventSub = this.props.bus.getSubscriber();
        hEventSub.on("hEvent").handle((event) => {
            if (event === "B747_8_PFD_MTRS") {
                SimVar.SetSimVarValue("L:74S_EFIS_METRES_ON", "Bool", !this.isMetresOn);
            }
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { visibility: this.visibility },
            FSComponent.buildComponent("g", null,
                FSComponent.buildComponent(BlackOutlineLine, { d: "M 632 314, h 104, v 30, h-104, Z", blackStroke: 5 }),
                FSComponent.buildComponent("text", { x: "715", y: "339", class: "text-3 end" }, this.metresText),
                FSComponent.buildComponent("text", { x: "728", y: "339", class: "text-2 cyan end" }, "M")),
            FSComponent.buildComponent("g", null,
                FSComponent.buildComponent("text", { x: "681", y: "41", class: "text-3 magenta end" }, this.selectedMetresText),
                FSComponent.buildComponent("text", { x: "682", y: "41", class: "text-2 cyan start" }, "M"))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class BaroSetting extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.units = false;
        this.baroHg = 0;
        this.preselBaro = 0;
        this.stdVisibility = Subject.create("hidden");
        this.valueRef = FSComponent.createRef();
        this.unitsRef = FSComponent.createRef();
        this.preselVisibility = Subject.create("hidden");
        this.preselContent = Subject.create("");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("isStd")
            .whenChanged()
            .handle((std) => {
            this.stdVisibility.set(std ? "visible" : "hidden");
            this.valueRef.instance.style.visibility = std ? "hidden" : "visible";
            this.unitsRef.instance.style.visibility = std ? "hidden" : "visible";
        });
        sub.on("baroUnits")
            .whenChanged()
            .handle((units) => {
            this.units = units;
            this.valueRef.instance.setAttribute("x", units ? "680" : "685");
            this.valueRef.instance.innerHTML = this.units ? (this.baroHg * 33.86).toFixed(0) : this.baroHg.toFixed(2);
            this.unitsRef.instance.setAttribute("x", units ? "725" : "715");
            this.unitsRef.instance.innerHTML = units ? " HPA" : " IN";
            this.preselContent.set(this.units ? (this.preselBaro / 1600).toFixed(0) + " HPA" : (this.preselBaro / 54182.4).toFixed(2) + " IN");
        });
        sub.on("baroHg")
            .whenChanged()
            .handle((baro) => {
            this.baroHg = baro;
            this.valueRef.instance.innerHTML = this.units ? (this.baroHg * 33.86).toFixed(0) : this.baroHg.toFixed(2);
        });
        sub.on("preselBaroVisible")
            .whenChanged()
            .handle((presel) => this.preselVisibility.set(presel ? "visible" : "hidden"));
        sub.on("preselBaro")
            .whenChanged()
            .handle((baro) => {
            this.preselBaro = baro;
            this.preselContent.set(this.units ? (this.preselBaro / 1600).toFixed(0) + " HPA" : (this.preselBaro / 54182.4).toFixed(2) + " IN");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("text", { x: "682", y: "710", class: "text-4 green", visibility: this.stdVisibility }, "STD"),
            FSComponent.buildComponent("text", { y: "710", class: "text-3 green", ref: this.valueRef }),
            FSComponent.buildComponent("text", { y: "710", class: "text-2 green", ref: this.unitsRef }),
            FSComponent.buildComponent("text", { x: "720", y: "745", visibility: this.preselVisibility, class: "text-2" }, this.preselContent)));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class Minimums extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.radioAltitude = 0;
        this.radioMinimums = 0;
        this.baroMinsVisibility = Subject.create("hidden");
        this.radioMinsVisibility = Subject.create("hidden");
        this.baroMinimumsValue = Subject.create(0);
        this.radioMinimumsValue = Subject.create(0);
        this.radioLabelClass = Subject.create("");
        this.radioValueClass = Subject.create("");
    }
    handleRadioMinimumsClass() {
        const classes = this.radioAltitude <= this.radioMinimums && this.radioAltitude > 1 ? "amber radio-mins-blink" : "green";
        this.radioLabelClass.set(`text-2 ${classes}`);
        this.radioValueClass.set(`text-3 ${classes}`);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("baroMinimums")
            .whenChanged()
            .handle((minimums) => {
            this.baroMinsVisibility.set(minimums >= -100 ? "visible" : "hidden");
            this.baroMinimumsValue.set(minimums);
        });
        sub.on("radioMinimums")
            .whenChanged()
            .handle((minimums) => {
            this.radioMinimums = minimums;
            this.handleRadioMinimumsClass();
            this.radioMinsVisibility.set(minimums > 0 ? "visible" : "hidden");
            this.radioMinimumsValue.set(minimums);
        });
        sub.on("altAboveGround")
            .withPrecision(0)
            .handle((altitude) => {
            this.radioAltitude = altitude;
            this.handleRadioMinimumsClass();
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { visibility: this.baroMinsVisibility },
                FSComponent.buildComponent("text", { x: "530", y: "638", class: "text-2 green" }, "BARO"),
                FSComponent.buildComponent("text", { x: "530", y: "668", class: "text-3 green" }, this.baroMinimumsValue)),
            FSComponent.buildComponent("g", { visibility: this.radioMinsVisibility },
                FSComponent.buildComponent("text", { x: "550", y: "85", class: this.radioLabelClass }, "RADIO"),
                FSComponent.buildComponent("text", { x: "550", y: "113", class: this.radioValueClass }, this.radioMinimumsValue))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class RadioAltimeter extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.radioAltitude = 0;
        this.radioMinimums = 0;
        this.radioAltimeterRef = FSComponent.createRef();
    }
    handleClass() {
        if (this.radioAltitude <= this.radioMinimums && this.radioAltitude > 1) {
            this.radioAltimeterRef.instance.classList.add("amber");
        }
        else {
            this.radioAltimeterRef.instance.classList.remove("amber");
        }
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altAboveGround")
            .withPrecision(0)
            .handle((altitude) => {
            this.radioAltitude = altitude;
            let displayAltitude = 0;
            if (altitude > 500) {
                displayAltitude = Math.round(altitude / 20) * 20;
            }
            else if (altitude > 100) {
                displayAltitude = Math.round(altitude / 10) * 10;
            }
            else {
                displayAltitude = Math.round(altitude / 2) * 2;
            }
            this.radioAltimeterRef.instance.innerHTML = displayAltitude.toString();
            this.radioAltimeterRef.instance.style.visibility = altitude <= 2500 ? "visible" : "hidden";
            this.handleClass();
        });
        sub.on("radioMinimums")
            .whenChanged()
            .handle((minimums) => {
            this.radioMinimums = minimums;
            this.handleClass();
        });
    }
    render() {
        return FSComponent.buildComponent("text", { x: "550", y: "150", class: "text-4", ref: this.radioAltimeterRef });
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class AltitudeTape extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.originElevation = 0;
        this.destinationElevation = 0;
        this.isHalfway = false;
        this.transform = Subject.create("");
        this.bgD = Subject.create("");
        this.noTdzVisibility = Subject.create("hidden");
        this.tdzVisibility = Subject.create("hidden");
        this.tdzD = Subject.create("");
    }
    handleTdz() {
        const tdzUnavailable = this.originElevation === -1 && this.destinationElevation === -1;
        this.noTdzVisibility.set(tdzUnavailable ? "visible" : "hidden");
        this.tdzVisibility.set(tdzUnavailable ? "hidden" : "visible");
        this.tdzD.set(`M 550 ${382 + (this.isHalfway ? this.destinationElevation : this.originElevation) * -0.68}, h 100, m -5 0, l 5 5, m -5 -5, m -10.6 0, l 18 18,
            m-18 -18, m-10.6 0, l 28 28, m-28 -28, m-10.6 0, l38 38, m-38 -38,
            m-10.6 0, l38 38, m-38 -38, m-10.6 0, l38 38, m-38 -38, m-10.6 0,
            l38 38, m-38 -38, m-10.6 0, l38 38, m-38 -38, m-10.6 0, l38 38, m-38 -38,
            m-10.6 0, l38 38, m-10.6 0, l-27.5 -27.5, m0 10.6, l16.75 16.75`);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.transform.set(`translate(50 ${altitude * 0.68})`);
            this.bgD.set(`M 567 ${332 - altitude * 0.68}, h 73, v 100, h -73, Z`);
        });
        sub.on("originElevation")
            .whenChanged()
            .handle((elevation) => {
            this.originElevation = elevation;
            this.handleTdz();
        });
        sub.on("destinationElevation")
            .whenChanged()
            .handle((elevation) => {
            this.destinationElevation = elevation;
            this.handleTdz();
        });
        sub.on("passedHalfway")
            .whenChanged()
            .handle((halfway) => {
            this.isHalfway = halfway;
            this.handleTdz();
        });
    }
    // TODO: make 500 feet lines shorter
    render() {
        const lineStyle = "stroke-linejoin: miter; stroke-linecap: butt; paint-order: stroke;";
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("clipPath", { id: "altitudetape-clip" },
                FSComponent.buildComponent("path", { d: "M575 100, h125, v560, h-125 Z" })),
            FSComponent.buildComponent("path", { class: "gray-bg", d: "M600 100, h100 v560 h-100 Z" }),
            FSComponent.buildComponent("g", { "clip-path": "url(#altitudetape-clip)" },
                FSComponent.buildComponent("g", { transform: this.transform },
                    Array.from({ length: 501 }, (_, i) => (FSComponent.buildComponent(BlackOutlineLine, { d: `${(i * 200) % 500 === 0 ? "M540" : "M550"} ${i * -68 + 382}, ${(i * 200) % 500 === 0 ? "h25" : "h15"}`, whiteStroke: (i * 200) % 500 === 0 ? 8 : 3, blackStroke: (i * 200) % 500 === 0 ? 10 : 5, styleColor: lineStyle, styleBlack: lineStyle }))),
                    Array.from({ length: 9 }, (_, i) => (FSComponent.buildComponent(BlackOutlineLine, { d: `${(i * 200) % 500 === 0 ? "M540" : "M550"} ${i * 68 + 382}, ${(i * 200) % 500 === 0 ? "h25" : "h15"}`, whiteStroke: (i * 200) % 500 === 0 ? 8 : 3, blackStroke: (i * 200) % 500 === 0 ? 10 : 5, styleColor: lineStyle, styleBlack: lineStyle }))),
                    Array.from({ length: 51 }, (_, i) => (FSComponent.buildComponent(FSComponent.Fragment, null,
                        FSComponent.buildComponent(BlackOutlineLine, { d: `M570 ${i * -680 + 365}, h79`, whiteStroke: 4, blackStroke: 5 }),
                        FSComponent.buildComponent(BlackOutlineLine, { d: `M570 ${i * -680 + 365 + 34}, h79`, whiteStroke: 4, blackStroke: 5 })))),
                    Array.from({ length: 251 }, (_, i) => {
                        const y = i * -136 + 382 + 11;
                        const text = (i * 200).toFixed(0);
                        const hundredsText = text.substring(text.length - 3);
                        let thousandsText = text.substring(0, 2);
                        if (i < 5) {
                            thousandsText = "";
                        }
                        else if (i < 50) {
                            thousandsText = text.substring(0, 1);
                        }
                        return (FSComponent.buildComponent(FSComponent.Fragment, null,
                            FSComponent.buildComponent("text", { x: "640", y: y, class: "text-2", "fill-opacity": 0.9 }, hundredsText),
                            FSComponent.buildComponent("text", { x: "603", y: y, class: "text-3", "fill-opacity": 0.9 }, thousandsText)));
                    }),
                    Array.from({ length: 5 }, (_, i) => {
                        const text = (i * 200).toFixed(0);
                        return (FSComponent.buildComponent("text", { x: "638", y: i * 136 + 382 + 11, class: "text-2", "fill-opacity": 0.85 }, i === 0 ? "" : `-${text.substring(text.length - 3)}`));
                    }),
                    FSComponent.buildComponent("path", { class: "gray-bg", d: this.bgD }),
                    FSComponent.buildComponent("g", { visibility: this.tdzVisibility },
                        FSComponent.buildComponent(BlackOutlineLine, { d: this.tdzD, color: "#ffc400", blackStroke: 5 })),
                    FSComponent.buildComponent(AltitudeBugs, { bus: this.props.bus }))),
            FSComponent.buildComponent("g", { visibility: this.noTdzVisibility },
                FSComponent.buildComponent("text", { x: "722", y: "645", class: "text-2 amber start" }, "NO"),
                FSComponent.buildComponent("text", { x: "722", y: "666", class: "text-2 amber start" }, "TDZ")),
            FSComponent.buildComponent(MetresDisplay, { bus: this.props.bus }),
            FSComponent.buildComponent(CommandAlt, { bus: this.props.bus }),
            FSComponent.buildComponent(BaroSetting, { bus: this.props.bus }),
            FSComponent.buildComponent(Minimums, { bus: this.props.bus }),
            FSComponent.buildComponent(RadioAltimeter, { bus: this.props.bus })));
    }
}
class AltitudeBugs extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.altitude = 0;
        this.selectedAltitude = 0;
        this.altitudeBugD = Subject.create("");
        this.minimumsBugD = Subject.create("");
    }
    handleAltitudeBug() {
        this.altitudeBugD.set(`M 550 ${Math.max(382 + (this.altitude + 420) * -0.68, Math.min(382 + this.selectedAltitude * -0.68, 382 + (this.altitude - 410) * -0.68))}, l -10 15, v23, h50, v-76, h-50, v23, Z`);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("altitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.altitude = altitude;
            this.handleAltitudeBug();
        });
        sub.on("selectedAltitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.selectedAltitude = altitude;
            this.handleAltitudeBug();
        });
        sub.on("baroMinimums")
            .whenChanged()
            .handle((minimums) => this.minimumsBugD.set(`M 650 ${382 + minimums * -0.68}, h -100, l-20 20, v -40, l20, 20`));
    }
    render() {
        return (FSComponent.buildComponent(FSComponent.Fragment, null,
            FSComponent.buildComponent(BlackOutlineLine, { d: this.minimumsBugD, color: "lime", whiteStroke: 5, blackStroke: 6 }),
            FSComponent.buildComponent(BlackOutlineLine, { d: this.altitudeBugD, color: "#d570ff", blackStroke: 5, styleBlack: "fill: none;", styleColor: "fill: none;" })));
    }
}
class CommandAlt extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.smallSelAltText = Subject.create("");
        this.largeSelAltText = Subject.create("");
        this.altAlertVisibility = Subject.create("hidden");
    }
    getSmallSelAltText(altitude) {
        const string = altitude.toString();
        return string.substring(string.length - 3);
    }
    getLargeSelAltText(altitude) {
        return altitude < 1000 ? "" : altitude.toString().substring(0, altitude >= 10000 ? 2 : 1);
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("selectedAltitude")
            .withPrecision(0)
            .handle((altitude) => {
            this.smallSelAltText.set(this.getSmallSelAltText(altitude));
            this.largeSelAltText.set(this.getLargeSelAltText(altitude));
        });
        sub.on("altAlertStatus")
            .whenChanged()
            .handle((status) => this.altAlertVisibility.set(status === 1 ? "visible" : "hidden"));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("text", { x: "649", y: "80", class: "text-4 magenta" }, this.largeSelAltText),
            FSComponent.buildComponent("text", { x: "695", y: "80", class: "text-3 magenta" }, this.smallSelAltText),
            FSComponent.buildComponent("path", { stroke: "white", "stroke-width": "3", "stroke-linejoin": "round", d: "M 602 48, h 96, v35, h-96, Z", fill: "none", visibility: this.altAlertVisibility })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class LateralDeviationScale extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.inboundLocCourse = 0;
        this.locRadial = 0;
        this.locSignal = false;
        this.locFrequency = 0;
        this.radioHeight = 0;
        this.flightPhase = 0;
        this.diamondRef = FSComponent.createRef();
        this.risingRunwayTransform = Subject.create("");
        this.risingRunwayVisibility = Subject.create("hidden");
        this.risingRunwayD = Subject.create("");
        this.risingRunwayD2 = Subject.create("");
        this.circlesGroupVisibility = Subject.create("hidden");
        this.circlesVisibility = Subject.create("hidden");
        this.expandedLocVisibility = Subject.create("hidden");
    }
    getRisingRunwayY(height) {
        return height <= 200 ? -112 + Math.max(height * 0.56, -112) : 0;
    }
    showExpandedLoc(locIndbCourse, locRadial) {
        return Math.abs(locIndbCourse - (locRadial + 180 > 360 ? locRadial - 360 : locRadial + 180)) < 0.6;
    }
    isLocAtMaxDeflection(locIndbCourse, locRadial) {
        return Math.abs(locIndbCourse - (locRadial + 180 > 360 ? locRadial - 360 : locRadial + 180)) > 2.33;
    }
    getLocDisplacement(locIndbCourse, locRadial) {
        let x = locIndbCourse - (locRadial + 180 > 360 ? locRadial - 360 : locRadial + 180);
        if (x > 2.33) {
            x = 2.33;
        }
        else if (x < -2.33) {
            x = -2.33;
        }
        const sensitivity = this.showExpandedLoc(locIndbCourse, locRadial) ? 182 : 57;
        return 349 - x * sensitivity;
    }
    handleDeviationScale() {
        this.diamondRef.instance.style.transform = `translate(${this.getLocDisplacement(this.inboundLocCourse, this.locRadial)}px, 0px)`;
        this.diamondRef.instance.style.fill = this.isLocAtMaxDeflection(this.inboundLocCourse, this.locRadial) ? "none" : "#d570ff";
        this.risingRunwayTransform.set(`translate(${this.getLocDisplacement(this.inboundLocCourse, this.locRadial)}, ${this.getRisingRunwayY(this.radioHeight)})`);
        this.circlesVisibility.set(!this.showExpandedLoc(this.inboundLocCourse, this.locRadial) && this.locFrequency !== 0 ? "visible" : "hidden");
        this.expandedLocVisibility.set(this.showExpandedLoc(this.inboundLocCourse, this.locRadial) ? "visible" : "hidden");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("inboundLocCourse")
            .whenChanged()
            .handle((course) => {
            this.inboundLocCourse = course;
            this.handleDeviationScale();
        });
        sub.on("locRadial")
            .whenChanged()
            .handle((radial) => {
            this.locRadial = radial;
            this.handleDeviationScale();
        });
        sub.on("locSignal")
            .whenChanged()
            .handle((signal) => {
            this.locSignal = signal;
            this.diamondRef.instance.style.visibility = this.locSignal ? "visible" : "hidden";
            this.risingRunwayVisibility.set(this.flightPhase >= 3 && this.radioHeight < 2500 && this.locSignal ? "visible" : "hidden");
        });
        sub.on("altAboveGround")
            .withPrecision(0)
            .handle((altitude) => {
            this.radioHeight = altitude;
            this.handleDeviationScale();
            this.risingRunwayTransform.set(`translate(${this.getLocDisplacement(this.inboundLocCourse, this.locRadial)}, ${this.getRisingRunwayY(this.radioHeight)})`);
            this.risingRunwayVisibility.set(this.flightPhase >= 3 && this.radioHeight < 2500 && this.locSignal ? "visible" : "hidden");
            this.risingRunwayD.set(`M -3 550, V${575 - this.getRisingRunwayY(this.radioHeight)}`);
            this.risingRunwayD2.set(`M 3 550, V${575 - this.getRisingRunwayY(this.radioHeight)}`);
        });
        sub.on("flightPhase")
            .whenChanged()
            .handle((phase) => {
            this.flightPhase = phase;
            this.risingRunwayVisibility.set(this.flightPhase >= 3 && this.radioHeight < 2500 && this.locSignal ? "visible" : "hidden");
        });
        sub.on("locFrequency")
            .whenChanged()
            .handle((frequency) => {
            this.locFrequency = frequency;
            this.handleDeviationScale();
            this.circlesGroupVisibility.set(frequency !== 0 ? "visible" : "hidden");
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("path", { d: "M 0 585, l-20 10, l20 10, l20, -10, Z", class: "line", stroke: "#d570ff", "stroke-width": "3", ref: this.diamondRef }),
            FSComponent.buildComponent("g", { transform: this.risingRunwayTransform, visibility: this.risingRunwayVisibility, fill: "none" },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M 0 545, h-100, l10 -20, h180, l10 20, h-100, v-20 Z", color: "lime", blackStroke: 5 }),
                FSComponent.buildComponent(BlackOutlineLine, { d: this.risingRunwayD, color: "#d570ff", blackStroke: 5 }),
                FSComponent.buildComponent(BlackOutlineLine, { d: this.risingRunwayD2, color: "#d570ff", blackStroke: 5 })),
            FSComponent.buildComponent("g", { visibility: this.circlesGroupVisibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M349 580, v30", blackStroke: 6, whiteStroke: 4 }),
                FSComponent.buildComponent("g", { visibility: this.circlesVisibility },
                    FSComponent.buildComponent("circle", { cx: "292", cy: "595", r: "6", fill: "none", class: "fpv-outline" }),
                    FSComponent.buildComponent("circle", { cx: "292", cy: "595", r: "6", fill: "none", class: "fpv-line" }),
                    FSComponent.buildComponent("circle", { cx: "235", cy: "595", r: "6", fill: "none", class: "fpv-outline" }),
                    FSComponent.buildComponent("circle", { cx: "235", cy: "595", r: "6", fill: "none", class: "fpv-line" }),
                    FSComponent.buildComponent("circle", { cx: "406", cy: "595", r: "6", fill: "none", class: "fpv-outline" }),
                    FSComponent.buildComponent("circle", { cx: "406", cy: "595", r: "6", fill: "none", class: "fpv-line" }),
                    FSComponent.buildComponent("circle", { cx: "463", cy: "595", r: "6", fill: "none", class: "fpv-outline" }),
                    FSComponent.buildComponent("circle", { cx: "463", cy: "595", r: "6", fill: "none", class: "fpv-line" })),
                FSComponent.buildComponent("g", { visibility: this.expandedLocVisibility },
                    FSComponent.buildComponent(BlackOutlineLine, { d: "M252 589, h12, v12, h-12, Z", blackStroke: 6, whiteStroke: 4, styleBlack: "fill: none;", styleColor: "fill: none;" }),
                    FSComponent.buildComponent(BlackOutlineLine, { d: "M446 589, h-12, v12, h12, Z", blackStroke: 6, whiteStroke: 4, styleBlack: "fill: none;", styleColor: "fill: none;" }))),
            FSComponent.buildComponent("path", { d: "M111 175, h45, v405, h-45 Z" }),
            FSComponent.buildComponent("path", { d: "M539 175, h45, v405, h-45 Z" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class VerticalDeviationScale extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.pathRef = FSComponent.createRef();
        this.circlesVisibility = Subject.create("hidden");
    }
    getGsDisplacement(gsError) {
        let boundedY = gsError * -2.44;
        if (boundedY > 2.33) {
            boundedY = 2.33;
        }
        else if (boundedY < -2.33) {
            boundedY = -2.33;
        }
        return 381 - boundedY * 57;
    }
    isGsAtMaxDeflection(gsError) {
        return Math.abs(gsError) > 0.9553;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("gsSignal")
            .whenChanged()
            .handle((signal) => (this.pathRef.instance.style.visibility = signal ? "visible" : "hidden"));
        sub.on("gsError")
            .whenChanged()
            .handle((error) => {
            this.pathRef.instance.setAttribute("d", `M 547 ${this.getGsDisplacement(error)}, l10 20, l10 -20, l-10 -20, Z`);
            this.pathRef.instance.style.fill = this.isGsAtMaxDeflection(error) ? "none" : "#d570ff";
        });
        sub.on("locFrequency")
            .whenChanged()
            .handle((frequency) => this.circlesVisibility.set(frequency !== 0 ? "visible" : "hidden"));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("path", { class: "line", stroke: "#d570ff", "stroke-width": "3", ref: this.pathRef }),
            FSComponent.buildComponent("g", { visibility: this.circlesVisibility },
                FSComponent.buildComponent(BlackOutlineLine, { d: "M542 381, h30", whiteStroke: 4, blackStroke: 6 }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "438", r: "6", fill: "none", class: "fpv-outline" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "438", r: "6", fill: "none", class: "fpv-line" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "495", r: "6", fill: "none", class: "fpv-outline" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "495", r: "6", fill: "none", class: "fpv-line" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "324", r: "6", fill: "none", class: "fpv-outline" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "324", r: "6", fill: "none", class: "fpv-line" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "267", r: "6", fill: "none", class: "fpv-outline" }),
                FSComponent.buildComponent("circle", { cx: "557", cy: "267", r: "6", fill: "none", class: "fpv-line" }))));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// TODO: RNP/ANP source
class ApproachInfo extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.locFrequency = 0;
        this.ilsIdent = "";
        this.ilsHasSignal = false;
        this.locCourse = 0;
        this.dmeHasSignal = false;
        this.dmeDistance = 0;
        this.visibility = Subject.create("hidden");
        this.ilsText = Subject.create("");
        this.dmeText = Subject.create("");
    }
    getILSText(frequency, ident, hasSignal, course) {
        let courseString = "";
        if (course < 10) {
            courseString = `00${course.toFixed(0)}°`;
        }
        else if (course < 100) {
            courseString = `0${course.toFixed(0)}°`;
        }
        else {
            courseString = `${course.toFixed(0)}°`;
        }
        return `${hasSignal ? ident : frequency.toFixed(2)}/${courseString}`;
    }
    getDMEText(hasSignal, distance) {
        const roundedDist = distance < 100 ? distance.toFixed(1) : distance.toFixed(0);
        return `DME\xa0${hasSignal && distance > 0 ? roundedDist : "---"}`;
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("locFrequency")
            .whenChanged()
            .handle((frequency) => {
            this.locFrequency = frequency;
            this.visibility.set(frequency !== 0 ? "visible" : "hidden");
            this.ilsText.set(this.getILSText(this.locFrequency, this.ilsIdent, this.ilsHasSignal, this.locCourse));
        });
        sub.on("ilsIdent")
            .whenChanged()
            .handle((ident) => {
            this.ilsIdent = ident;
            this.ilsText.set(this.getILSText(this.locFrequency, this.ilsIdent, this.ilsHasSignal, this.locCourse));
        });
        sub.on("locSignal")
            .whenChanged()
            .handle((signal) => {
            this.ilsHasSignal = signal;
            this.ilsText.set(this.getILSText(this.locFrequency, this.ilsIdent, this.ilsHasSignal, this.locCourse));
        });
        sub.on("locCourse")
            .whenChanged()
            .handle((course) => {
            this.locCourse = course;
            this.ilsText.set(this.getILSText(this.locFrequency, this.ilsIdent, this.ilsHasSignal, this.locCourse));
        });
        sub.on("dmeSignal")
            .whenChanged()
            .handle((signal) => {
            this.dmeHasSignal = signal;
            this.dmeText.set(this.getDMEText(this.dmeHasSignal, this.dmeDistance));
        });
        sub.on("dmeDistance")
            .withPrecision(1)
            .handle((distance) => {
            this.dmeDistance = distance;
            this.dmeText.set(this.getDMEText(this.dmeHasSignal, this.dmeDistance));
        });
    }
    render() {
        return (FSComponent.buildComponent("g", { visibility: this.visibility },
            FSComponent.buildComponent("text", { x: "160", y: "100", class: "text-2 start" }, this.ilsText),
            FSComponent.buildComponent("text", { x: "160", y: "127", class: "text-2 start" }, this.dmeText)));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class FMAColumn extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.topText = "";
        this.greenBoxVisibility = Subject.create("hidden");
    }
    handleBox(text) {
        if (text) {
            this.greenBoxVisibility.set("visible");
            setTimeout(() => this.greenBoxVisibility.set("hidden"), 10000);
        }
        else
            this.greenBoxVisibility.set("hidden");
    }
    onAfterRender(node) {
        var _a, _b;
        super.onAfterRender(node);
        (_a = this.props.topText) === null || _a === void 0 ? void 0 : _a.sub((text) => {
            this.topText = text;
            this.handleBox(text);
        });
        (_b = this.props.extraHighlightVar) === null || _b === void 0 ? void 0 : _b.sub((_) => this.handleBox(this.topText));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("g", { visibility: this.greenBoxVisibility },
                FSComponent.buildComponent("rect", { x: this.props.x - 65, y: this.props.y, width: "130", height: "27", fill: "none", class: "line", stroke: "black", "stroke-width": "5" }),
                FSComponent.buildComponent("rect", { x: this.props.x - 65, y: this.props.y, width: "130", height: "27", fill: "none", class: "line", stroke: "lime", "stroke-width": "3" })),
            FSComponent.buildComponent("text", { x: this.props.x, y: this.props.y + 25, class: "text-3 green middle" }, this.props.topText),
            FSComponent.buildComponent("text", { x: this.props.x, y: this.props.y + 48, class: "text-2 middle" }, this.props.bottomText)));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class AFDSStatus extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.afdsStatus = Subject.create(0);
        this.afdsStatusText = Subject.create("");
        this.autolandClass = Subject.create("");
        this.noAutolandVisibility = Subject.create("hidden");
        this.greenBoxVisibility = Subject.create("hidden");
        this.amberBoxVisibility = Subject.create("hidden");
        this.afdsStatuses = ["", "FD", "CMD", "LAND 2", "LAND 3", "AUTOLAND"];
    }
    handleAFDSBoxes(text) {
        // sunday morning is every day for all i care
        if (text) {
            if (text === "AUTOLAND") {
                this.greenBoxVisibility.set("hidden");
                this.amberBoxVisibility.set("visible");
                setTimeout(() => this.amberBoxVisibility.set("hidden"), 10000);
            }
            this.amberBoxVisibility.set("hidden");
            this.greenBoxVisibility.set("visible");
            setTimeout(() => this.greenBoxVisibility.set("hidden"), 10000);
        }
        else {
            this.greenBoxVisibility.set("hidden");
            this.amberBoxVisibility.set("hidden");
        }
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("afdsStatus")
            .whenChanged()
            .handle((status) => {
            const text = status < this.afdsStatuses.length ? this.afdsStatuses[status] : "";
            this.afdsStatus.set(status);
            this.afdsStatusText.set(text);
            this.autolandClass.set(text === "AUTOLAND" ? "text-4 amber middle" : "text-4 green middle");
            this.noAutolandVisibility.set(text === "AUTOLAND" ? "visible" : "hidden");
            this.handleAFDSBoxes(text);
        });
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("text", { x: "349", y: "165", class: this.autolandClass }, this.afdsStatusText),
            FSComponent.buildComponent("text", { x: "349", y: "133", visibility: this.noAutolandVisibility, class: this.autolandClass }, "NO"),
            FSComponent.buildComponent("rect", { x: "267", y: "133", visibility: this.greenBoxVisibility, width: "164", height: "34", fill: "none", class: "line", stroke: "lime", "stroke-width": "3" }),
            FSComponent.buildComponent("path", { d: "M 267 133, h59, v-34, h46, v34, h59, v34, h-164, Z", visibility: this.amberBoxVisibility, class: "line", stroke: "#ffc400", "stroke-width": "3", fill: "none" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class FMA extends DisplayComponent {
    constructor() {
        super(...arguments);
        this.apOn = false;
        this.fdOn = Subject.create(false);
        this.autothrottleModes = ["", "THR REF", "THR", "IDLE", "SPD", "HOLD"];
        this.autothrottleArmed = Subject.create(false);
        this.autothrottleMode = Subject.create(0);
        this.activeAutothrottleText = Subject.create("");
        this.activeRollModes = ["", "TO/GA", "HDG HOLD", "HDG SEL", "LNAV", "LOC", "FAC", "ROLLOUT", "ATT"];
        this.armedRollModes = ["", "LOC", "FAC", "LNAV", "ROLLOUT"];
        this.activeRollMode = 0;
        this.armedRollText = Subject.create("");
        this.activeRollText = Subject.create("");
        this.activePitchModes = ["", "TO/GA", "ALT", "VNAV ALT", "VNAV PTH", "VNAV SPD", "VNAV", "FLCH SPD", "V/S", "G/S", "G/P", "FLARE"];
        this.armedPitchModes = ["", "G/S", "G/P", "VNAV", "FLARE"];
        this.activePitchText = Subject.create("");
        this.armedPitchText = Subject.create("");
    }
    handleAutothrottleMode() {
        this.activeAutothrottleText.set(this.autothrottleMode.get() < this.autothrottleModes.length && this.autothrottleArmed.get()
            ? this.autothrottleModes[this.autothrottleMode.get()]
            : "");
    }
    handleActiveRollMode() {
        this.activeRollText.set(this.activeRollMode < this.activeRollModes.length && (this.fdOn.get() || this.apOn) ? this.activeRollModes[this.activeRollMode] : "");
    }
    onAfterRender(node) {
        super.onAfterRender(node);
        const sub = this.props.bus.getSubscriber();
        sub.on("autothrottleArmed")
            .whenChanged()
            .handle((armed) => {
            this.autothrottleArmed.set(armed);
            this.handleAutothrottleMode();
        });
        sub.on("autothrottleMode")
            .whenChanged()
            .handle((mode) => {
            this.autothrottleMode.set(mode);
            this.handleAutothrottleMode();
        });
        sub.on("armedRollMode")
            .whenChanged()
            .handle((mode) => this.armedRollText.set(mode < this.armedRollModes.length ? this.armedRollModes[mode] : ""));
        sub.on("activeRollMode")
            .whenChanged()
            .handle((mode) => {
            this.activeRollMode = mode;
            this.handleActiveRollMode();
        });
        sub.on("fdOn")
            .whenChanged()
            .handle((fdOn) => {
            this.fdOn.set(fdOn);
            this.handleActiveRollMode();
        });
        sub.on("apOn")
            .whenChanged()
            .handle((apOn) => {
            this.apOn = apOn;
            this.handleActiveRollMode();
        });
        sub.on("activePitchMode")
            .whenChanged()
            .handle((mode) => this.activePitchText.set(mode < this.activePitchModes.length ? this.activePitchModes[mode] : ""));
        sub.on("armedPitchMode")
            .whenChanged()
            .handle((mode) => this.armedPitchText.set(mode < this.armedPitchModes.length ? this.armedPitchModes[mode] : ""));
    }
    render() {
        return (FSComponent.buildComponent("g", null,
            FSComponent.buildComponent("path", { class: "gray-bg", d: "M130 10, h450, v50, h-450 Z" }),
            FSComponent.buildComponent(FMAColumn, { x: 208, y: 10, topText: this.activeAutothrottleText }),
            FSComponent.buildComponent(FMAColumn, { x: 356, y: 10, topText: this.activeRollText, bottomText: this.armedRollText, extraHighlightVar: this.fdOn }),
            FSComponent.buildComponent(FMAColumn, { x: 505, y: 10, topText: this.activePitchText, bottomText: this.armedPitchText, extraHighlightVar: this.fdOn }),
            FSComponent.buildComponent(AFDSStatus, { bus: this.props.bus }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M286 10, v50" }),
            FSComponent.buildComponent(BlackOutlineLine, { d: "M428 10, v50" })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class PFD extends DisplayComponent {
    render() {
        return (FSComponent.buildComponent("svg", { className: "pfd-svg", viewBox: "0 0 800 800", xmlns: "http://www.w3.org/2000/svg" },
            FSComponent.buildComponent(Horizon, { bus: this.props.bus }),
            FSComponent.buildComponent(LateralDeviationScale, { bus: this.props.bus }),
            FSComponent.buildComponent(VerticalDeviationScale, { bus: this.props.bus }),
            FSComponent.buildComponent(VerticalSpeedIndicator, { bus: this.props.bus }),
            FSComponent.buildComponent(HeadingDisplay, { bus: this.props.bus }),
            FSComponent.buildComponent(SpeedTape, { bus: this.props.bus }),
            FSComponent.buildComponent(AirspeedScroller, { bus: this.props.bus }),
            FSComponent.buildComponent(AltitudeTape, { bus: this.props.bus }),
            FSComponent.buildComponent(AltitudeScroller, { bus: this.props.bus }),
            FSComponent.buildComponent(ApproachInfo, { bus: this.props.bus }),
            FSComponent.buildComponent(FMA, { bus: this.props.bus })));
    }
}

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
var PFDVars;
(function (PFDVars) {
    PFDVars["pitch"] = "PLANE PITCH DEGREES";
    PFDVars["roll"] = "PLANE BANK DEGREES";
    PFDVars["sideslip"] = "INCIDENCE BETA";
    PFDVars["altitude"] = "INDICATED ALTITUDE";
    PFDVars["airspeed"] = "AIRSPEED INDICATED";
    PFDVars["groundSpeed"] = "GROUND VELOCITY";
    PFDVars["maneuveringSpeed"] = "L:74S_ADC_MANEUVERING_SPEED";
    PFDVars["machSpeed"] = "L:74S_ADC_MACH_NUMBER";
    PFDVars["maxSpeed"] = "L:74S_ADC_MAXIMUM_SPEED";
    PFDVars["minSpeed"] = "L:74S_ADC_MINIMUM_SPEED";
    PFDVars["flapsHandle"] = "FLAPS HANDLE INDEX";
    PFDVars["actualFlapAngle"] = "TRAILING EDGE FLAPS LEFT ANGLE";
    PFDVars["landingFlaps"] = "L:SALTY_SELECTED_APPROACH_FLAP";
    PFDVars["takeoffFlaps"] = "L:SALTY_TAKEOFF_FLAP_VALUE";
    PFDVars["altAboveGround"] = "PLANE ALT ABOVE GROUND MINUS CG";
    PFDVars["incidenceAlpha"] = "INCIDENCE ALPHA";
    PFDVars["stallAlpha"] = "STALL ALPHA";
    PFDVars["fdPitch"] = "AUTOPILOT FLIGHT DIRECTOR PITCH";
    PFDVars["fdRoll"] = "AUTOPILOT FLIGHT DIRECTOR BANK";
    PFDVars["irsState"] = "L:SALTY_IRS_STATE";
    PFDVars["fdOn"] = "AUTOPILOT FLIGHT DIRECTOR ACTIVE:1";
    PFDVars["verticalVelocity"] = "VELOCITY WORLD Y";
    PFDVars["horizontalVelocity"] = "VELOCITY BODY Z";
    PFDVars["trueHeading"] = "PLANE HEADING DEGREES TRUE";
    PFDVars["magneticHeading"] = "PLANE HEADING DEGREES MAGNETIC";
    PFDVars["trueTrack"] = "GPS GROUND TRUE TRACK";
    PFDVars["magneticTrack"] = "GPS GROUND MAGNETIC TRACK";
    PFDVars["fpvOn"] = "L:SALTY_FPV_ON";
    PFDVars["markerBeaconState"] = "MARKER BEACON STATE";
    PFDVars["verticalSpeed"] = "VERTICAL SPEED";
    PFDVars["vsActive"] = "L:AP_VS_ACTIVE";
    PFDVars["selectedVs"] = "AUTOPILOT VERTICAL HOLD VAR";
    PFDVars["selectedHeading"] = "AUTOPILOT HEADING LOCK DIR:1";
    PFDVars["selectedSpeed"] = "AUTOPILOT AIRSPEED HOLD VAR";
    PFDVars["selectedMachSpeed"] = "AUTOPILOT MACH HOLD VAR";
    PFDVars["selectedAltitude"] = "AUTOPILOT ALTITUDE LOCK VAR:3";
    PFDVars["v1"] = "L:AIRLINER_V1_SPEED";
    PFDVars["vR"] = "L:AIRLINER_VR_SPEED";
    PFDVars["v2"] = "L:AIRLINER_V2_SPEED";
    PFDVars["vRef25"] = "L:SALTY_VREF25";
    PFDVars["vRef30"] = "L:SALTY_VREF30";
    PFDVars["vRef"] = "L:AIRLINER_VREF_SPEED";
    PFDVars["flightPhase"] = "L:AIRLINER_FLIGHT_PHASE";
    PFDVars["onGround"] = "SIM ON GROUND";
    PFDVars["isInMach"] = "L:XMLVAR_AirSpeedIsInMach";
    PFDVars["altAlertStatus"] = "L:74S_ALT_ALERT";
    PFDVars["originElevation"] = "L:74S_FMC_ORIGIN_ELEVATION";
    PFDVars["destinationElevation"] = "L:74S_FMC_DEST_ELEVATION";
    PFDVars["passedHalfway"] = "L:74S_FMC_PASSED_HALFWAY";
    PFDVars["baroMinimums"] = "L:74S_MINS_BARO";
    PFDVars["radioMinimums"] = "L:74S_MINS_RADIO";
    PFDVars["isMetresOn"] = "L:74S_EFIS_METRES_ON";
    PFDVars["isStd"] = "L:XMLVAR_Baro1_ForcedToSTD";
    PFDVars["baroUnits"] = "L:XMLVAR_Baro_Selector_HPA_1";
    PFDVars["baroHg"] = "KOHLSMAN SETTING HG";
    PFDVars["preselBaroVisible"] = "L:74S_BARO_PRESEL_VISIBLE";
    PFDVars["preselBaro"] = "L:XMLVAR_Baro1_SavedPressure";
    PFDVars["inboundLocCourse"] = "NAV LOCALIZER:3";
    PFDVars["locRadial"] = "NAV RADIAL:3";
    PFDVars["locSignal"] = "NAV HAS NAV:3";
    PFDVars["locFrequency"] = "NAV ACTIVE FREQUENCY:3";
    PFDVars["gsSignal"] = "NAV GS FLAG:3";
    PFDVars["gsError"] = "NAV GLIDE SLOPE ERROR:3";
    PFDVars["ilsIdent"] = "NAV IDENT:3";
    PFDVars["locCourse"] = "L:FLIGHTPLAN_APPROACH_COURSE";
    PFDVars["dmeSignal"] = "NAV HAS DME:3";
    PFDVars["dmeDistance"] = "NAV DME:3";
    PFDVars["afdsStatus"] = "L:74S_AFDS_STATUS";
    PFDVars["autothrottleMode"] = "L:74S_AUTOTHROTTLE_MODE_ACTIVE";
    PFDVars["autothrottleArmed"] = "AUTOPILOT THROTTLE ARM";
    PFDVars["activeRollMode"] = "L:74S_ROLL_MODE_ACTIVE";
    PFDVars["armedRollMode"] = "L:74S_ROLL_MODE_ARMED";
    PFDVars["apOn"] = "AUTOPILOT MASTER";
    PFDVars["activePitchMode"] = "L:74S_PITCH_MODE_ACTIVE";
    PFDVars["armedPitchMode"] = "L:74S_PITCH_MODE_ARMED";
    PFDVars["acceleration"] = "ACCELERATION BODY Z";
})(PFDVars || (PFDVars = {}));
class PFDSimvarPublisher extends SimVarPublisher {
    constructor(bus) {
        super(PFDSimvarPublisher.simvars, bus);
    }
}
PFDSimvarPublisher.simvars = new Map([
    ["pitch", { name: PFDVars.pitch, type: SimVarValueType.Degree }],
    ["roll", { name: PFDVars.roll, type: SimVarValueType.Degree }],
    ["sideslip", { name: PFDVars.sideslip, type: SimVarValueType.Degree }],
    ["altitude", { name: PFDVars.altitude, type: SimVarValueType.Feet }],
    ["airspeed", { name: PFDVars.airspeed, type: SimVarValueType.Knots }],
    ["groundSpeed", { name: PFDVars.groundSpeed, type: SimVarValueType.Knots }],
    ["verticalSpeed", { name: PFDVars.verticalSpeed, type: SimVarValueType.FPM }],
    ["maneuveringSpeed", { name: PFDVars.maneuveringSpeed, type: SimVarValueType.Knots }],
    ["machSpeed", { name: PFDVars.machSpeed, type: SimVarValueType.Number }],
    ["maxSpeed", { name: PFDVars.maxSpeed, type: SimVarValueType.Knots }],
    ["minSpeed", { name: PFDVars.minSpeed, type: SimVarValueType.Knots }],
    ["flapsHandle", { name: PFDVars.flapsHandle, type: SimVarValueType.Number }],
    ["landingFlaps", { name: PFDVars.landingFlaps, type: SimVarValueType.Number }],
    ["takeoffFlaps", { name: PFDVars.takeoffFlaps, type: SimVarValueType.Number }],
    ["actualFlapAngle", { name: PFDVars.actualFlapAngle, type: SimVarValueType.Degree }],
    ["altAboveGround", { name: PFDVars.altAboveGround, type: SimVarValueType.Feet }],
    ["incidenceAlpha", { name: PFDVars.incidenceAlpha, type: SimVarValueType.Degree }],
    ["stallAlpha", { name: PFDVars.stallAlpha, type: SimVarValueType.Degree }],
    ["fdPitch", { name: PFDVars.fdPitch, type: SimVarValueType.Degree }],
    ["fdRoll", { name: PFDVars.fdRoll, type: SimVarValueType.Degree }],
    ["fdOn", { name: PFDVars.fdOn, type: SimVarValueType.Bool }],
    ["irsState", { name: PFDVars.irsState, type: SimVarValueType.Enum }],
    ["verticalVelocity", { name: PFDVars.verticalVelocity, type: SimVarValueType.FPM }],
    ["horizontalVelocity", { name: PFDVars.horizontalVelocity, type: SimVarValueType.FPM }],
    ["trueHeading", { name: PFDVars.trueHeading, type: SimVarValueType.Degree }],
    ["magneticHeading", { name: PFDVars.magneticHeading, type: SimVarValueType.Degree }],
    ["trueTrack", { name: PFDVars.trueTrack, type: SimVarValueType.Degree }],
    ["magneticTrack", { name: PFDVars.magneticTrack, type: SimVarValueType.Degree }],
    ["fpvOn", { name: PFDVars.fpvOn, type: SimVarValueType.Bool }],
    ["markerBeaconState", { name: PFDVars.markerBeaconState, type: SimVarValueType.Enum }],
    ["vsActive", { name: PFDVars.vsActive, type: SimVarValueType.Bool }],
    ["selectedVs", { name: PFDVars.selectedVs, type: SimVarValueType.FPM }],
    ["selectedHeading", { name: PFDVars.selectedHeading, type: SimVarValueType.Degree }],
    ["selectedSpeed", { name: PFDVars.selectedSpeed, type: SimVarValueType.Knots }],
    ["selectedMachSpeed", { name: PFDVars.selectedMachSpeed, type: SimVarValueType.Number }],
    ["selectedAltitude", { name: PFDVars.selectedAltitude, type: SimVarValueType.Feet }],
    ["v1", { name: PFDVars.v1, type: SimVarValueType.Knots }],
    ["vR", { name: PFDVars.vR, type: SimVarValueType.Knots }],
    ["v2", { name: PFDVars.v2, type: SimVarValueType.Knots }],
    ["vRef25", { name: PFDVars.vRef25, type: SimVarValueType.Knots }],
    ["vRef30", { name: PFDVars.vRef30, type: SimVarValueType.Knots }],
    ["vRef", { name: PFDVars.vRef, type: SimVarValueType.Knots }],
    ["flightPhase", { name: PFDVars.flightPhase, type: SimVarValueType.Number }],
    ["onGround", { name: PFDVars.onGround, type: SimVarValueType.Bool }],
    ["isInMach", { name: PFDVars.isInMach, type: SimVarValueType.Bool }],
    ["altAlertStatus", { name: PFDVars.altAlertStatus, type: SimVarValueType.Number }],
    ["originElevation", { name: PFDVars.originElevation, type: SimVarValueType.Number }],
    ["destinationElevation", { name: PFDVars.destinationElevation, type: SimVarValueType.Number }],
    ["passedHalfway", { name: PFDVars.passedHalfway, type: SimVarValueType.Bool }],
    ["baroMinimums", { name: PFDVars.baroMinimums, type: SimVarValueType.Feet }],
    ["radioMinimums", { name: PFDVars.radioMinimums, type: SimVarValueType.Feet }],
    ["isMetresOn", { name: PFDVars.isMetresOn, type: SimVarValueType.Bool }],
    ["isStd", { name: PFDVars.isStd, type: SimVarValueType.Bool }],
    ["baroUnits", { name: PFDVars.baroUnits, type: SimVarValueType.Bool }],
    ["baroHg", { name: PFDVars.baroHg, type: SimVarValueType.InHG }],
    ["preselBaroVisible", { name: PFDVars.preselBaroVisible, type: SimVarValueType.Bool }],
    ["preselBaro", { name: PFDVars.preselBaro, type: SimVarValueType.Number }],
    ["inboundLocCourse", { name: PFDVars.inboundLocCourse, type: SimVarValueType.Degree }],
    ["locRadial", { name: PFDVars.locRadial, type: SimVarValueType.Degree }],
    ["locSignal", { name: PFDVars.locSignal, type: SimVarValueType.Bool }],
    ["locFrequency", { name: PFDVars.locFrequency, type: SimVarValueType.MHz }],
    ["gsSignal", { name: PFDVars.gsSignal, type: SimVarValueType.Bool }],
    ["gsError", { name: PFDVars.gsError, type: SimVarValueType.Degree }],
    ["ilsIdent", { name: PFDVars.ilsIdent, type: SimVarValueType.String }],
    ["locCourse", { name: PFDVars.locCourse, type: SimVarValueType.Number }],
    ["dmeSignal", { name: PFDVars.dmeSignal, type: SimVarValueType.Bool }],
    ["dmeDistance", { name: PFDVars.dmeDistance, type: SimVarValueType.NM }],
    ["afdsStatus", { name: PFDVars.afdsStatus, type: SimVarValueType.Enum }],
    ["autothrottleMode", { name: PFDVars.autothrottleMode, type: SimVarValueType.Enum }],
    ["autothrottleArmed", { name: PFDVars.autothrottleArmed, type: SimVarValueType.Bool }],
    ["activeRollMode", { name: PFDVars.activeRollMode, type: SimVarValueType.Enum }],
    ["armedRollMode", { name: PFDVars.armedRollMode, type: SimVarValueType.Enum }],
    ["apOn", { name: PFDVars.apOn, type: SimVarValueType.Bool }],
    ["activePitchMode", { name: PFDVars.activePitchMode, type: SimVarValueType.Enum }],
    ["armedPitchMode", { name: PFDVars.armedPitchMode, type: SimVarValueType.Enum }],
    ["acceleration", { name: PFDVars.acceleration, type: SimVarValueType.FPM }],
]);

/**
 * Copyright (C) 2022 Salty Simulations and its contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
class MyInstrument extends BaseInstrument {
    constructor() {
        super();
        this.bus = new EventBus();
        this.simVarPublisher = new PFDSimvarPublisher(this.bus);
        this.hEventPublisher = new HEventPublisher(this.bus);
    }
    get templateID() {
        return "pfd";
    }
    connectedCallback() {
        super.connectedCallback();
        this.simVarPublisher.startPublish();
        this.hEventPublisher.startPublish();
        for (const simvar of PFDSimvarPublisher.simvars.keys()) {
            this.simVarPublisher.subscribe(simvar);
        }
        FSComponent.render(FSComponent.buildComponent(PFD, { bus: this.bus }), document.getElementById("InstrumentContent"));
    }
    onInteractionEvent(args) {
        this.hEventPublisher.dispatchHEvent(args[0]);
    }
    Update() {
        this.simVarPublisher.onUpdate();
    }
}
registerInstrument("salty-pfd", MyInstrument);
