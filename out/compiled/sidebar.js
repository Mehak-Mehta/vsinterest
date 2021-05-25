var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_custom_element_data(node, prop, value) {
        if (prop in node) {
            node[prop] = typeof node[prop] === 'boolean' && value === '' ? true : value;
        }
        else {
            attr(node, prop, value);
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
            'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error('Cannot have duplicate keys in a keyed each');
            }
            keys.add(key);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* node_modules\@sveltejs\svelte-virtual-list\VirtualList.svelte generated by Svelte v3.38.2 */
    const file$1 = "node_modules\\@sveltejs\\svelte-virtual-list\\VirtualList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i];
    	return child_ctx;
    }

    const get_default_slot_changes = dirty => ({ item: dirty & /*visible*/ 16 });
    const get_default_slot_context = ctx => ({ item: /*row*/ ctx[23].data });

    // (166:26) Missing template
    function fallback_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("Missing template");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(166:26) Missing template",
    		ctx
    	});

    	return block;
    }

    // (164:2) {#each visible as row (row.index)}
    function create_each_block(key_1, ctx) {
    	let svelte_virtual_list_row;
    	let t;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[14].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[13], get_default_slot_context);
    	const default_slot_or_fallback = default_slot || fallback_block(ctx);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			svelte_virtual_list_row = element("svelte-virtual-list-row");
    			if (default_slot_or_fallback) default_slot_or_fallback.c();
    			t = space();
    			set_custom_element_data(svelte_virtual_list_row, "class", "svelte-1tqh76q");
    			add_location(svelte_virtual_list_row, file$1, 164, 3, 3469);
    			this.first = svelte_virtual_list_row;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svelte_virtual_list_row, anchor);

    			if (default_slot_or_fallback) {
    				default_slot_or_fallback.m(svelte_virtual_list_row, null);
    			}

    			append_dev(svelte_virtual_list_row, t);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope, visible*/ 8208)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[13], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svelte_virtual_list_row);
    			if (default_slot_or_fallback) default_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(164:2) {#each visible as row (row.index)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let svelte_virtual_list_viewport;
    	let svelte_virtual_list_contents;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let svelte_virtual_list_viewport_resize_listener;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*visible*/ ctx[4];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*row*/ ctx[23].index;
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			svelte_virtual_list_viewport = element("svelte-virtual-list-viewport");
    			svelte_virtual_list_contents = element("svelte-virtual-list-contents");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			set_style(svelte_virtual_list_contents, "padding-top", /*top*/ ctx[5] + "px");
    			set_style(svelte_virtual_list_contents, "padding-bottom", /*bottom*/ ctx[6] + "px");
    			set_custom_element_data(svelte_virtual_list_contents, "class", "svelte-1tqh76q");
    			add_location(svelte_virtual_list_contents, file$1, 159, 1, 3313);
    			set_style(svelte_virtual_list_viewport, "height", /*height*/ ctx[0]);
    			set_custom_element_data(svelte_virtual_list_viewport, "class", "svelte-1tqh76q");
    			add_render_callback(() => /*svelte_virtual_list_viewport_elementresize_handler*/ ctx[17].call(svelte_virtual_list_viewport));
    			add_location(svelte_virtual_list_viewport, file$1, 153, 0, 3167);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svelte_virtual_list_viewport, anchor);
    			append_dev(svelte_virtual_list_viewport, svelte_virtual_list_contents);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(svelte_virtual_list_contents, null);
    			}

    			/*svelte_virtual_list_contents_binding*/ ctx[15](svelte_virtual_list_contents);
    			/*svelte_virtual_list_viewport_binding*/ ctx[16](svelte_virtual_list_viewport);
    			svelte_virtual_list_viewport_resize_listener = add_resize_listener(svelte_virtual_list_viewport, /*svelte_virtual_list_viewport_elementresize_handler*/ ctx[17].bind(svelte_virtual_list_viewport));
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(svelte_virtual_list_viewport, "scroll", /*handle_scroll*/ ctx[7], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$$scope, visible*/ 8208) {
    				each_value = /*visible*/ ctx[4];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, svelte_virtual_list_contents, outro_and_destroy_block, create_each_block, null, get_each_context);
    				check_outros();
    			}

    			if (!current || dirty & /*top*/ 32) {
    				set_style(svelte_virtual_list_contents, "padding-top", /*top*/ ctx[5] + "px");
    			}

    			if (!current || dirty & /*bottom*/ 64) {
    				set_style(svelte_virtual_list_contents, "padding-bottom", /*bottom*/ ctx[6] + "px");
    			}

    			if (!current || dirty & /*height*/ 1) {
    				set_style(svelte_virtual_list_viewport, "height", /*height*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svelte_virtual_list_viewport);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			/*svelte_virtual_list_contents_binding*/ ctx[15](null);
    			/*svelte_virtual_list_viewport_binding*/ ctx[16](null);
    			svelte_virtual_list_viewport_resize_listener();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("VirtualList", slots, ['default']);
    	let { items } = $$props;
    	let { height = "100%" } = $$props;
    	let { itemHeight = undefined } = $$props;
    	let foo;
    	let { start = 0 } = $$props;
    	let { end = 0 } = $$props;

    	// local state
    	let height_map = [];

    	let rows;
    	let viewport;
    	let contents;
    	let viewport_height = 0;
    	let visible;
    	let mounted;
    	let top = 0;
    	let bottom = 0;
    	let average_height;

    	async function refresh(items, viewport_height, itemHeight) {
    		const { scrollTop } = viewport;
    		await tick(); // wait until the DOM is up to date
    		let content_height = top - scrollTop;
    		let i = start;

    		while (content_height < viewport_height && i < items.length) {
    			let row = rows[i - start];

    			if (!row) {
    				$$invalidate(9, end = i + 1);
    				await tick(); // render the newly visible row
    				row = rows[i - start];
    			}

    			const row_height = height_map[i] = itemHeight || row.offsetHeight;
    			content_height += row_height;
    			i += 1;
    		}

    		$$invalidate(9, end = i);
    		const remaining = items.length - end;
    		average_height = (top + content_height) / end;
    		$$invalidate(6, bottom = remaining * average_height);
    		height_map.length = items.length;
    	}

    	async function handle_scroll() {
    		const { scrollTop } = viewport;
    		const old_start = start;

    		for (let v = 0; v < rows.length; v += 1) {
    			height_map[start + v] = itemHeight || rows[v].offsetHeight;
    		}

    		let i = 0;
    		let y = 0;

    		while (i < items.length) {
    			const row_height = height_map[i] || average_height;

    			if (y + row_height > scrollTop) {
    				$$invalidate(8, start = i);
    				$$invalidate(5, top = y);
    				break;
    			}

    			y += row_height;
    			i += 1;
    		}

    		while (i < items.length) {
    			y += height_map[i] || average_height;
    			i += 1;
    			if (y > scrollTop + viewport_height) break;
    		}

    		$$invalidate(9, end = i);
    		const remaining = items.length - end;
    		average_height = y / end;
    		while (i < items.length) height_map[i++] = average_height;
    		$$invalidate(6, bottom = remaining * average_height);

    		// prevent jumping if we scrolled up into unknown territory
    		if (start < old_start) {
    			await tick();
    			let expected_height = 0;
    			let actual_height = 0;

    			for (let i = start; i < old_start; i += 1) {
    				if (rows[i - start]) {
    					expected_height += height_map[i];
    					actual_height += itemHeight || rows[i - start].offsetHeight;
    				}
    			}

    			const d = actual_height - expected_height;
    			viewport.scrollTo(0, scrollTop + d);
    		}
    	} // TODO if we overestimated the space these
    	// rows would occupy we may need to add some

    	// more. maybe we can just call handle_scroll again?
    	// trigger initial refresh
    	onMount(() => {
    		rows = contents.getElementsByTagName("svelte-virtual-list-row");
    		$$invalidate(12, mounted = true);
    	});

    	const writable_props = ["items", "height", "itemHeight", "start", "end"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<VirtualList> was created with unknown prop '${key}'`);
    	});

    	function svelte_virtual_list_contents_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contents = $$value;
    			$$invalidate(3, contents);
    		});
    	}

    	function svelte_virtual_list_viewport_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			viewport = $$value;
    			$$invalidate(2, viewport);
    		});
    	}

    	function svelte_virtual_list_viewport_elementresize_handler() {
    		viewport_height = this.offsetHeight;
    		$$invalidate(1, viewport_height);
    	}

    	$$self.$$set = $$props => {
    		if ("items" in $$props) $$invalidate(10, items = $$props.items);
    		if ("height" in $$props) $$invalidate(0, height = $$props.height);
    		if ("itemHeight" in $$props) $$invalidate(11, itemHeight = $$props.itemHeight);
    		if ("start" in $$props) $$invalidate(8, start = $$props.start);
    		if ("end" in $$props) $$invalidate(9, end = $$props.end);
    		if ("$$scope" in $$props) $$invalidate(13, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		tick,
    		items,
    		height,
    		itemHeight,
    		foo,
    		start,
    		end,
    		height_map,
    		rows,
    		viewport,
    		contents,
    		viewport_height,
    		visible,
    		mounted,
    		top,
    		bottom,
    		average_height,
    		refresh,
    		handle_scroll
    	});

    	$$self.$inject_state = $$props => {
    		if ("items" in $$props) $$invalidate(10, items = $$props.items);
    		if ("height" in $$props) $$invalidate(0, height = $$props.height);
    		if ("itemHeight" in $$props) $$invalidate(11, itemHeight = $$props.itemHeight);
    		if ("foo" in $$props) foo = $$props.foo;
    		if ("start" in $$props) $$invalidate(8, start = $$props.start);
    		if ("end" in $$props) $$invalidate(9, end = $$props.end);
    		if ("height_map" in $$props) height_map = $$props.height_map;
    		if ("rows" in $$props) rows = $$props.rows;
    		if ("viewport" in $$props) $$invalidate(2, viewport = $$props.viewport);
    		if ("contents" in $$props) $$invalidate(3, contents = $$props.contents);
    		if ("viewport_height" in $$props) $$invalidate(1, viewport_height = $$props.viewport_height);
    		if ("visible" in $$props) $$invalidate(4, visible = $$props.visible);
    		if ("mounted" in $$props) $$invalidate(12, mounted = $$props.mounted);
    		if ("top" in $$props) $$invalidate(5, top = $$props.top);
    		if ("bottom" in $$props) $$invalidate(6, bottom = $$props.bottom);
    		if ("average_height" in $$props) average_height = $$props.average_height;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*items, start, end*/ 1792) {
    			$$invalidate(4, visible = items.slice(start, end).map((data, i) => {
    				return { index: i + start, data };
    			}));
    		}

    		if ($$self.$$.dirty & /*mounted, items, viewport_height, itemHeight*/ 7170) {
    			// whenever `items` changes, invalidate the current heightmap
    			if (mounted) refresh(items, viewport_height, itemHeight);
    		}
    	};

    	return [
    		height,
    		viewport_height,
    		viewport,
    		contents,
    		visible,
    		top,
    		bottom,
    		handle_scroll,
    		start,
    		end,
    		items,
    		itemHeight,
    		mounted,
    		$$scope,
    		slots,
    		svelte_virtual_list_contents_binding,
    		svelte_virtual_list_viewport_binding,
    		svelte_virtual_list_viewport_elementresize_handler
    	];
    }

    class VirtualList$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			items: 10,
    			height: 0,
    			itemHeight: 11,
    			start: 8,
    			end: 9
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "VirtualList",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*items*/ ctx[10] === undefined && !("items" in props)) {
    			console.warn("<VirtualList> was created without expected prop 'items'");
    		}
    	}

    	get items() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set items(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get itemHeight() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set itemHeight(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get start() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set start(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get end() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set end(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* webviews\components\hidden.svelte generated by Svelte v3.38.2 */

    // (17:0) {#if shown}
    function create_if_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[3].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[2], dirty, null, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(17:0) {#if shown}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*shown*/ ctx[0] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*shown*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*shown*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Hidden", slots, ['default']);
    	let shown = false;
    	let dispatch = createEventDispatcher();

    	function show() {
    		$$invalidate(0, shown = !shown);
    		dispatch("show", shown);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Hidden> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		shown,
    		dispatch,
    		show
    	});

    	$$self.$inject_state = $$props => {
    		if ("shown" in $$props) $$invalidate(0, shown = $$props.shown);
    		if ("dispatch" in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [shown, show, $$scope, slots];
    }

    class Hidden extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { show: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Hidden",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get show() {
    		return this.$$.ctx[1];
    	}

    	set show(value) {
    		throw new Error("<Hidden>: Cannot set read-only property 'show'");
    	}
    }

    /* webviews\components\VirtualList.svelte generated by Svelte v3.38.2 */

    function create_fragment$2(ctx) {
    	const block = {
    		c: noop,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("VirtualList", slots, []);
    	let shown = false;
    	let dispatch = createEventDispatcher();

    	function show() {
    		shown = !shown;
    		dispatch("show", shown);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<VirtualList> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		shown,
    		dispatch,
    		show
    	});

    	$$self.$inject_state = $$props => {
    		if ("shown" in $$props) shown = $$props.shown;
    		if ("dispatch" in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [show];
    }

    class VirtualList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { show: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "VirtualList",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get show() {
    		return this.$$.ctx[0];
    	}

    	set show(value) {
    		throw new Error("<VirtualList>: Cannot set read-only property 'show'");
    	}
    }

    /* webviews\components\ListItem.svelte generated by Svelte v3.38.2 */

    function create_fragment$1(ctx) {
    	const block = {
    		c: noop,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("ListItem", slots, []);
    	let shown = false;
    	let dispatch = createEventDispatcher();

    	function show() {
    		shown = !shown;
    		dispatch("show", shown);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ListItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		shown,
    		dispatch,
    		show
    	});

    	$$self.$inject_state = $$props => {
    		if ("shown" in $$props) shown = $$props.shown;
    		if ("dispatch" in $$props) dispatch = $$props.dispatch;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [show];
    }

    class ListItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { show: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ListItem",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get show() {
    		return this.$$.ctx[0];
    	}

    	set show(value) {
    		throw new Error("<ListItem>: Cannot set read-only property 'show'");
    	}
    }

    /* webviews\components\sidebar.svelte generated by Svelte v3.38.2 */
    const file = "webviews\\components\\sidebar.svelte";

    // (28:0) <Hidden bind:this={child} on:show={e => child.shown = e.detail}>
    function create_default_slot_3(ctx) {
    	let div0;
    	let li0;
    	let a0;
    	let t1;
    	let p0;
    	let t3;
    	let div1;
    	let li1;
    	let a1;
    	let t5;
    	let p1;
    	let t7;
    	let div2;
    	let li2;
    	let a2;
    	let t9;
    	let p2;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Sudoku Solver";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Sudoku Solver Using Backtracing Algorithum";
    			t3 = space();
    			div1 = element("div");
    			li1 = element("li");
    			a1 = element("a");
    			a1.textContent = "Account Storage";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "GUI for Account Storage Using tkinter";
    			t7 = space();
    			div2 = element("div");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "PassWord Generator";
    			t9 = space();
    			p2 = element("p");
    			p2.textContent = "Simple PassWord Generator Using Python";
    			attr_dev(a0, "href", "https://github.com/Mehak-Mehta/Sudoku-Solver");
    			attr_dev(a0, "class", "svelte-1nr8jn4");
    			add_location(a0, file, 29, 5, 666);
    			add_location(p0, file, 30, 1, 741);
    			add_location(li0, file, 29, 1, 662);
    			attr_dev(div0, "class", "links svelte-1nr8jn4");
    			add_location(div0, file, 28, 4, 640);
    			attr_dev(a1, "href", "https://github.com/Mehak-Mehta/Account-Storage");
    			attr_dev(a1, "class", "svelte-1nr8jn4");
    			add_location(a1, file, 35, 5, 837);
    			add_location(p1, file, 36, 1, 916);
    			add_location(li1, file, 35, 1, 833);
    			attr_dev(div1, "class", "Acc");
    			add_location(div1, file, 34, 1, 813);
    			attr_dev(a2, "href", "https://github.com/Mehak-Mehta/Password-Generator");
    			attr_dev(a2, "class", "svelte-1nr8jn4");
    			add_location(a2, file, 41, 5, 1008);
    			add_location(p2, file, 42, 1, 1093);
    			add_location(li2, file, 41, 1, 1004);
    			attr_dev(div2, "class", "pass");
    			add_location(div2, file, 40, 1, 983);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, li0);
    			append_dev(li0, a0);
    			append_dev(li0, t1);
    			append_dev(li0, p0);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, li1);
    			append_dev(li1, a1);
    			append_dev(li1, t5);
    			append_dev(li1, p1);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, li2);
    			append_dev(li2, a2);
    			append_dev(li2, t9);
    			append_dev(li2, p2);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(28:0) <Hidden bind:this={child} on:show={e => child.shown = e.detail}>",
    		ctx
    	});

    	return block;
    }

    // (51:0) <Hidden bind:this={classname} on:show={e => classname.shown = e.detail}>
    function create_default_slot_2(ctx) {
    	let div0;
    	let li0;
    	let a0;
    	let t1;
    	let p0;
    	let t3;
    	let div1;
    	let li1;
    	let a1;
    	let t5;
    	let p1;
    	let t7;
    	let div2;
    	let li2;
    	let a2;
    	let t9;
    	let p2;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Apollo GraphQL Server";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Apollo graphql server with express and mongoDB";
    			t3 = space();
    			div1 = element("div");
    			li1 = element("li");
    			a1 = element("a");
    			a1.textContent = "Express.js API";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "REST API Using Node , Express , MongoDB";
    			t7 = space();
    			div2 = element("div");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "Hunter x Hunter";
    			t9 = space();
    			p2 = element("p");
    			p2.textContent = "Front-end Hunter x Hunter Web Using React.";
    			attr_dev(a0, "href", "https://github.com/Mehak-Mehta/Apollo-GraphQL-Server");
    			attr_dev(a0, "class", "svelte-1nr8jn4");
    			add_location(a0, file, 52, 5, 1335);
    			add_location(p0, file, 53, 1, 1426);
    			add_location(li0, file, 52, 1, 1331);
    			attr_dev(div0, "class", "links svelte-1nr8jn4");
    			add_location(div0, file, 51, 4, 1309);
    			attr_dev(a1, "href", "https://github.com/Mehak-Mehta/Express.js-API");
    			attr_dev(a1, "class", "svelte-1nr8jn4");
    			add_location(a1, file, 58, 5, 1527);
    			add_location(li1, file, 58, 1, 1523);
    			add_location(p1, file, 60, 1, 1612);
    			attr_dev(div1, "class", "links svelte-1nr8jn4");
    			add_location(div1, file, 57, 1, 1501);
    			attr_dev(a2, "href", "https://github.com/Mehak-Mehta/HunterxHunter-Web");
    			attr_dev(a2, "class", "svelte-1nr8jn4");
    			add_location(a2, file, 64, 5, 1699);
    			add_location(li2, file, 64, 1, 1695);
    			add_location(p2, file, 66, 1, 1788);
    			attr_dev(div2, "class", "links svelte-1nr8jn4");
    			add_location(div2, file, 63, 1, 1673);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, li0);
    			append_dev(li0, a0);
    			append_dev(li0, t1);
    			append_dev(li0, p0);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, li1);
    			append_dev(li1, a1);
    			append_dev(div1, t5);
    			append_dev(div1, p1);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, li2);
    			append_dev(li2, a2);
    			append_dev(div2, t9);
    			append_dev(div2, p2);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(51:0) <Hidden bind:this={classname} on:show={e => classname.shown = e.detail}>",
    		ctx
    	});

    	return block;
    }

    // (72:0) <Hidden bind:this={name} on:show={e => name.shown = e.detail}>
    function create_default_slot_1(ctx) {
    	let div0;
    	let li0;
    	let a0;
    	let t1;
    	let p0;
    	let t3;
    	let div1;
    	let li1;
    	let a1;
    	let t5;
    	let p1;
    	let t7;
    	let strong0;
    	let t9;
    	let div2;
    	let li2;
    	let a2;
    	let t11;
    	let p2;
    	let t13;
    	let strong1;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Nest GraphQL Server";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Nest graphql server with mongoDB";
    			t3 = space();
    			div1 = element("div");
    			li1 = element("li");
    			a1 = element("a");
    			a1.textContent = "vstodo";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "Todo list for VSCode";
    			t7 = space();
    			strong0 = element("strong");
    			strong0.textContent = "Owner: benawad";
    			t9 = space();
    			div2 = element("div");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "deno rest api";
    			t11 = space();
    			p2 = element("p");
    			p2.textContent = "Simple REST API using Deno and Oak";
    			t13 = space();
    			strong1 = element("strong");
    			strong1.textContent = "Owner: bradtraversy";
    			attr_dev(a0, "href", "https://github.com/Mehak-Mehta/Nest-GraphQL-Server");
    			attr_dev(a0, "class", "svelte-1nr8jn4");
    			add_location(a0, file, 73, 5, 2005);
    			add_location(p0, file, 74, 1, 2092);
    			add_location(li0, file, 73, 1, 2001);
    			attr_dev(div0, "class", "links svelte-1nr8jn4");
    			add_location(div0, file, 72, 4, 1979);
    			attr_dev(a1, "href", "https://github.com/benawad/vstodo");
    			attr_dev(a1, "class", "svelte-1nr8jn4");
    			add_location(a1, file, 79, 5, 2180);
    			add_location(li1, file, 79, 1, 2176);
    			add_location(p1, file, 81, 1, 2245);
    			add_location(strong0, file, 81, 29, 2273);
    			attr_dev(div1, "class", "links svelte-1nr8jn4");
    			add_location(div1, file, 78, 1, 2154);
    			attr_dev(a2, "href", "https://github.com/bradtraversy/deno-rest-api");
    			attr_dev(a2, "class", "svelte-1nr8jn4");
    			add_location(a2, file, 85, 5, 2345);
    			add_location(li2, file, 85, 1, 2341);
    			add_location(p2, file, 87, 1, 2429);
    			add_location(strong1, file, 87, 43, 2471);
    			attr_dev(div2, "class", "links svelte-1nr8jn4");
    			add_location(div2, file, 84, 1, 2319);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, li0);
    			append_dev(li0, a0);
    			append_dev(li0, t1);
    			append_dev(li0, p0);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, li1);
    			append_dev(li1, a1);
    			append_dev(div1, t5);
    			append_dev(div1, p1);
    			append_dev(div1, t7);
    			append_dev(div1, strong0);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, li2);
    			append_dev(li2, a2);
    			append_dev(div2, t11);
    			append_dev(div2, p2);
    			append_dev(div2, t13);
    			append_dev(div2, strong1);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(72:0) <Hidden bind:this={name} on:show={e => name.shown = e.detail}>",
    		ctx
    	});

    	return block;
    }

    // (93:0) <Hidden bind:this={hname} on:show={e => hname.shown = e.detail}>
    function create_default_slot(ctx) {
    	let div0;
    	let li0;
    	let a0;
    	let t1;
    	let p0;
    	let t3;
    	let div1;
    	let li1;
    	let a1;
    	let t5;
    	let p1;
    	let t7;
    	let strong0;
    	let t9;
    	let div2;
    	let li2;
    	let a2;
    	let t11;
    	let p2;
    	let t13;
    	let strong1;

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			li0 = element("li");
    			a0 = element("a");
    			a0.textContent = "Website Template";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Basic HTML Website";
    			t3 = space();
    			div1 = element("div");
    			li1 = element("li");
    			a1 = element("a");
    			a1.textContent = "HTML elements";
    			t5 = space();
    			p1 = element("p");
    			p1.textContent = "Set of simplified and stylized HTML elements";
    			t7 = space();
    			strong0 = element("strong");
    			strong0.textContent = "Owner: Alicunde";
    			t9 = space();
    			div2 = element("div");
    			li2 = element("li");
    			a2 = element("a");
    			a2.textContent = "Responsive Portfolio";
    			t11 = space();
    			p2 = element("p");
    			p2.textContent = "This is a Responsive Portfolio Website";
    			t13 = space();
    			strong1 = element("strong");
    			strong1.textContent = "Owner: bornmay";
    			attr_dev(a0, "href", "https://github.com/Mehak-Mehta/WebTemp");
    			attr_dev(a0, "class", "svelte-1nr8jn4");
    			add_location(a0, file, 94, 5, 2678);
    			add_location(p0, file, 95, 1, 2750);
    			add_location(li0, file, 94, 1, 2674);
    			attr_dev(div0, "class", "links svelte-1nr8jn4");
    			add_location(div0, file, 93, 4, 2652);
    			attr_dev(a1, "href", "https://github.com/Alicunde/HTML");
    			attr_dev(a1, "class", "svelte-1nr8jn4");
    			add_location(a1, file, 100, 5, 2825);
    			add_location(p1, file, 101, 1, 2888);
    			add_location(strong0, file, 101, 53, 2940);
    			add_location(li1, file, 100, 1, 2821);
    			attr_dev(div1, "class", "links svelte-1nr8jn4");
    			add_location(div1, file, 99, 1, 2799);
    			attr_dev(a2, "href", "https://github.com/bornmay/Responsive-Portfolio");
    			attr_dev(a2, "class", "svelte-1nr8jn4");
    			add_location(a2, file, 107, 5, 3024);
    			add_location(p2, file, 108, 1, 3109);
    			add_location(strong1, file, 108, 47, 3155);
    			add_location(li2, file, 107, 1, 3020);
    			attr_dev(div2, "class", "links svelte-1nr8jn4");
    			add_location(div2, file, 106, 1, 2998);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, li0);
    			append_dev(li0, a0);
    			append_dev(li0, t1);
    			append_dev(li0, p0);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, li1);
    			append_dev(li1, a1);
    			append_dev(li1, t5);
    			append_dev(li1, p1);
    			append_dev(li1, t7);
    			append_dev(li1, strong0);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, li2);
    			append_dev(li2, a2);
    			append_dev(li2, t11);
    			append_dev(li2, p2);
    			append_dev(li2, t13);
    			append_dev(li2, strong1);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(93:0) <Hidden bind:this={hname} on:show={e => hname.shown = e.detail}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div0;
    	let strong;
    	let t1;
    	let p0;
    	let t3;
    	let p1;
    	let t4;
    	let a0;
    	let t6;
    	let t7;
    	let button0;
    	let t9;
    	let hidden0;
    	let t10;
    	let button1;
    	let t12;
    	let hidden1;
    	let t13;
    	let button2;
    	let t15;
    	let hidden2;
    	let t16;
    	let button3;
    	let t18;
    	let hidden3;
    	let t19;
    	let div1;
    	let t21;
    	let div2;
    	let t22;
    	let a1;
    	let current;
    	let mounted;
    	let dispose;

    	let hidden0_props = {
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	};

    	hidden0 = new Hidden({ props: hidden0_props, $$inline: true });
    	/*hidden0_binding*/ ctx[4](hidden0);
    	hidden0.$on("show", /*show_handler*/ ctx[5]);

    	let hidden1_props = {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	};

    	hidden1 = new Hidden({ props: hidden1_props, $$inline: true });
    	/*hidden1_binding*/ ctx[6](hidden1);
    	hidden1.$on("show", /*show_handler_1*/ ctx[7]);

    	let hidden2_props = {
    		$$slots: { default: [create_default_slot_1] },
    		$$scope: { ctx }
    	};

    	hidden2 = new Hidden({ props: hidden2_props, $$inline: true });
    	/*hidden2_binding*/ ctx[8](hidden2);
    	hidden2.$on("show", /*show_handler_2*/ ctx[9]);

    	let hidden3_props = {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	};

    	hidden3 = new Hidden({ props: hidden3_props, $$inline: true });
    	/*hidden3_binding*/ ctx[10](hidden3);
    	hidden3.$on("show", /*show_handler_3*/ ctx[11]);

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			strong = element("strong");
    			strong.textContent = "VSInterest:";
    			t1 = space();
    			p0 = element("p");
    			p0.textContent = "Here you can find Github repos of similar languages.";
    			t3 = space();
    			p1 = element("p");
    			t4 = text("Here is the ");
    			a0 = element("a");
    			a0.textContent = "Source Code ";
    			t6 = text(".");
    			t7 = text("\r\n\r\n\r\nSelect language: \r\n\r\n\r\n");
    			button0 = element("button");
    			button0.textContent = "Python";
    			t9 = space();
    			create_component(hidden0.$$.fragment);
    			t10 = space();
    			button1 = element("button");
    			button1.textContent = "JavaScript";
    			t12 = space();
    			create_component(hidden1.$$.fragment);
    			t13 = space();
    			button2 = element("button");
    			button2.textContent = "TypeScript";
    			t15 = space();
    			create_component(hidden2.$$.fragment);
    			t16 = space();
    			button3 = element("button");
    			button3.textContent = "Html & CSS";
    			t18 = space();
    			create_component(hidden3.$$.fragment);
    			t19 = space();
    			div1 = element("div");
    			div1.textContent = "More languages coming soon!!";
    			t21 = space();
    			div2 = element("div");
    			t22 = text("Made By ");
    			a1 = element("a");
    			a1.textContent = "Mehak Mehta";
    			add_location(strong, file, 16, 0, 300);
    			attr_dev(div0, "class", "header svelte-1nr8jn4");
    			add_location(div0, file, 15, 0, 278);
    			add_location(p0, file, 18, 0, 340);
    			attr_dev(a0, "href", "https://github.com/Mehak-Mehta/VSInterest");
    			attr_dev(a0, "class", "svelte-1nr8jn4");
    			add_location(a0, file, 19, 16, 418);
    			add_location(p1, file, 19, 0, 402);
    			add_location(button0, file, 25, 0, 521);
    			add_location(button1, file, 48, 0, 1174);
    			add_location(button2, file, 70, 0, 1861);
    			add_location(button3, file, 91, 0, 2531);
    			add_location(div1, file, 115, 0, 3224);
    			attr_dev(a1, "href", "https://github.com/Mehak-Mehta");
    			attr_dev(a1, "class", "svelte-1nr8jn4");
    			add_location(a1, file, 117, 14, 3282);
    			add_location(div2, file, 117, 0, 3268);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, strong);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, p0, anchor);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, t4);
    			append_dev(p1, a0);
    			append_dev(p1, t6);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, button0, anchor);
    			insert_dev(target, t9, anchor);
    			mount_component(hidden0, target, anchor);
    			insert_dev(target, t10, anchor);
    			insert_dev(target, button1, anchor);
    			insert_dev(target, t12, anchor);
    			mount_component(hidden1, target, anchor);
    			insert_dev(target, t13, anchor);
    			insert_dev(target, button2, anchor);
    			insert_dev(target, t15, anchor);
    			mount_component(hidden2, target, anchor);
    			insert_dev(target, t16, anchor);
    			insert_dev(target, button3, anchor);
    			insert_dev(target, t18, anchor);
    			mount_component(hidden3, target, anchor);
    			insert_dev(target, t19, anchor);
    			insert_dev(target, div1, anchor);
    			insert_dev(target, t21, anchor);
    			insert_dev(target, div2, anchor);
    			append_dev(div2, t22);
    			append_dev(div2, a1);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(
    						button0,
    						"click",
    						function () {
    							if (is_function(/*child*/ ctx[0].show)) /*child*/ ctx[0].show.apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button1,
    						"click",
    						function () {
    							if (is_function(/*classname*/ ctx[1].show)) /*classname*/ ctx[1].show.apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button2,
    						"click",
    						function () {
    							if (is_function(/*name*/ ctx[2].show)) /*name*/ ctx[2].show.apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					),
    					listen_dev(
    						button3,
    						"click",
    						function () {
    							if (is_function(/*hname*/ ctx[3].show)) /*hname*/ ctx[3].show.apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;
    			const hidden0_changes = {};

    			if (dirty & /*$$scope*/ 4096) {
    				hidden0_changes.$$scope = { dirty, ctx };
    			}

    			hidden0.$set(hidden0_changes);
    			const hidden1_changes = {};

    			if (dirty & /*$$scope*/ 4096) {
    				hidden1_changes.$$scope = { dirty, ctx };
    			}

    			hidden1.$set(hidden1_changes);
    			const hidden2_changes = {};

    			if (dirty & /*$$scope*/ 4096) {
    				hidden2_changes.$$scope = { dirty, ctx };
    			}

    			hidden2.$set(hidden2_changes);
    			const hidden3_changes = {};

    			if (dirty & /*$$scope*/ 4096) {
    				hidden3_changes.$$scope = { dirty, ctx };
    			}

    			hidden3.$set(hidden3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(hidden0.$$.fragment, local);
    			transition_in(hidden1.$$.fragment, local);
    			transition_in(hidden2.$$.fragment, local);
    			transition_in(hidden3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(hidden0.$$.fragment, local);
    			transition_out(hidden1.$$.fragment, local);
    			transition_out(hidden2.$$.fragment, local);
    			transition_out(hidden3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(p0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(p1);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button0);
    			if (detaching) detach_dev(t9);
    			/*hidden0_binding*/ ctx[4](null);
    			destroy_component(hidden0, detaching);
    			if (detaching) detach_dev(t10);
    			if (detaching) detach_dev(button1);
    			if (detaching) detach_dev(t12);
    			/*hidden1_binding*/ ctx[6](null);
    			destroy_component(hidden1, detaching);
    			if (detaching) detach_dev(t13);
    			if (detaching) detach_dev(button2);
    			if (detaching) detach_dev(t15);
    			/*hidden2_binding*/ ctx[8](null);
    			destroy_component(hidden2, detaching);
    			if (detaching) detach_dev(t16);
    			if (detaching) detach_dev(button3);
    			if (detaching) detach_dev(t18);
    			/*hidden3_binding*/ ctx[10](null);
    			destroy_component(hidden3, detaching);
    			if (detaching) detach_dev(t19);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t21);
    			if (detaching) detach_dev(div2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Sidebar", slots, []);
    	let child;
    	let classname;
    	let name;
    	let hname;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	function hidden0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			child = $$value;
    			$$invalidate(0, child);
    		});
    	}

    	const show_handler = e => $$invalidate(0, child.shown = e.detail, child);

    	function hidden1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			classname = $$value;
    			$$invalidate(1, classname);
    		});
    	}

    	const show_handler_1 = e => $$invalidate(1, classname.shown = e.detail, classname);

    	function hidden2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			name = $$value;
    			$$invalidate(2, name);
    		});
    	}

    	const show_handler_2 = e => $$invalidate(2, name.shown = e.detail, name);

    	function hidden3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			hname = $$value;
    			$$invalidate(3, hname);
    		});
    	}

    	const show_handler_3 = e => $$invalidate(3, hname.shown = e.detail, hname);

    	$$self.$capture_state = () => ({
    		VirtualList: VirtualList$1,
    		Hidden,
    		Hiddens: VirtualList,
    		Hide: ListItem,
    		child,
    		classname,
    		name,
    		hname
    	});

    	$$self.$inject_state = $$props => {
    		if ("child" in $$props) $$invalidate(0, child = $$props.child);
    		if ("classname" in $$props) $$invalidate(1, classname = $$props.classname);
    		if ("name" in $$props) $$invalidate(2, name = $$props.name);
    		if ("hname" in $$props) $$invalidate(3, hname = $$props.hname);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		child,
    		classname,
    		name,
    		hname,
    		hidden0_binding,
    		show_handler,
    		hidden1_binding,
    		show_handler_1,
    		hidden2_binding,
    		show_handler_2,
    		hidden3_binding,
    		show_handler_3
    	];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new Sidebar({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=sidebar.js.map
