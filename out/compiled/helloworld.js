var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
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
    function children(element) {
        return Array.from(element.childNodes);
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

    /* webviews\components\hidden.svelte generated by Svelte v3.38.2 */

    function create_if_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[3].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[2], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*shown*/ ctx[0] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
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
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let shown = false;
    	let dispatch = createEventDispatcher();

    	function show() {
    		$$invalidate(0, shown = !shown);
    		dispatch("show", shown);
    	}

    	$$self.$$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	return [shown, show, $$scope, slots];
    }

    class Hidden extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { show: 1 });
    	}

    	get show() {
    		return this.$$.ctx[1];
    	}
    }

    /* webviews\components\HelloWorld.svelte generated by Svelte v3.38.2 */

    function create_default_slot_3(ctx) {
    	let div0;
    	let t3;
    	let div1;
    	let t7;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");

    			div0.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Sudoku-Solver" class="svelte-1lwn8p5">Sudoku Solver</a> 
	<p>Sudoku Solver Using Backtracing Algorithum</p></li>`;

    			t3 = space();
    			div1 = element("div");

    			div1.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Account-Storage" class="svelte-1lwn8p5">Account Storage</a> 
	<p>GUI for Account Storage Using tkinter</p></li>`;

    			t7 = space();
    			div2 = element("div");

    			div2.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Password-Generator" class="svelte-1lwn8p5">PassWord Generator</a> 
	<p>Simple PassWord Generator Using Python</p></li>`;

    			attr(div0, "class", "links svelte-1lwn8p5");
    			attr(div1, "class", "Acc");
    			attr(div2, "class", "pass");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			insert(target, t7, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			if (detaching) detach(t7);
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (53:0) <Hidden bind:this={classname} on:show={e => classname.shown = e.detail}>
    function create_default_slot_2(ctx) {
    	let div0;
    	let t3;
    	let div1;
    	let t7;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");

    			div0.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Apollo-GraphQL-Server" class="svelte-1lwn8p5">Apollo GraphQL Server</a> 
	<p>Apollo graphql server with express and mongoDB</p></li>`;

    			t3 = space();
    			div1 = element("div");

    			div1.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Express.js-API" class="svelte-1lwn8p5">Express.js API</a></li> 
	<p>REST API Using Node , Express , MongoDB</p>`;

    			t7 = space();
    			div2 = element("div");

    			div2.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/HunterxHunter-Web" class="svelte-1lwn8p5">Hunter x Hunter</a></li> 
	<p>Front-end Hunter x Hunter Web Using React.</p>`;

    			attr(div0, "class", "links svelte-1lwn8p5");
    			attr(div1, "class", "links svelte-1lwn8p5");
    			attr(div2, "class", "links svelte-1lwn8p5");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			insert(target, t7, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			if (detaching) detach(t7);
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (74:0) <Hidden bind:this={name} on:show={e => name.shown = e.detail}>
    function create_default_slot_1(ctx) {
    	let div0;
    	let t3;
    	let div1;
    	let t9;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");

    			div0.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/Nest-GraphQL-Server" class="svelte-1lwn8p5">Nest GraphQL Server</a> 
	<p>Nest graphql server with mongoDB</p></li>`;

    			t3 = space();
    			div1 = element("div");

    			div1.innerHTML = `<li><a href="https://github.com/benawad/vstodo" class="svelte-1lwn8p5">vstodo</a></li> 
	<p>Todo list for VSCode</p>  <strong>Owner: benawad</strong>`;

    			t9 = space();
    			div2 = element("div");

    			div2.innerHTML = `<li><a href="https://github.com/bradtraversy/deno-rest-api" class="svelte-1lwn8p5">deno rest api</a></li> 
	<p>Simple REST API using Deno and Oak</p>  <strong>Owner: bradtraversy</strong>`;

    			attr(div0, "class", "links svelte-1lwn8p5");
    			attr(div1, "class", "links svelte-1lwn8p5");
    			attr(div2, "class", "links svelte-1lwn8p5");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			insert(target, t9, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			if (detaching) detach(t9);
    			if (detaching) detach(div2);
    		}
    	};
    }

    // (95:0) <Hidden bind:this={hname} on:show={e => hname.shown = e.detail}>
    function create_default_slot(ctx) {
    	let div0;
    	let t3;
    	let div1;
    	let t9;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");

    			div0.innerHTML = `<li><a href="https://github.com/Mehak-Mehta/WebTemp" class="svelte-1lwn8p5">Website Template</a> 
	<p>Basic HTML Website</p></li>`;

    			t3 = space();
    			div1 = element("div");

    			div1.innerHTML = `<li><a href="https://github.com/Alicunde/HTML" class="svelte-1lwn8p5">HTML elements</a> 
	<p>Set of simplified and stylized HTML elements</p>  <strong>Owner: Alicunde</strong></li>`;

    			t9 = space();
    			div2 = element("div");

    			div2.innerHTML = `<li><a href="https://github.com/bornmay/Responsive-Portfolio" class="svelte-1lwn8p5">Responsive Portfolio</a> 
	<p>This is a Responsive Portfolio Website</p>  <strong>Owner: bornmay</strong></li>`;

    			attr(div0, "class", "links svelte-1lwn8p5");
    			attr(div1, "class", "links svelte-1lwn8p5");
    			attr(div2, "class", "links svelte-1lwn8p5");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			insert(target, t9, anchor);
    			insert(target, div2, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			if (detaching) detach(t9);
    			if (detaching) detach(div2);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div0;
    	let t2;
    	let p0;
    	let t4;
    	let p1;
    	let t8;
    	let button0;
    	let t10;
    	let hidden0;
    	let t11;
    	let button1;
    	let t13;
    	let hidden1;
    	let t14;
    	let button2;
    	let t16;
    	let hidden2;
    	let t17;
    	let button3;
    	let t19;
    	let hidden3;
    	let t20;
    	let div1;
    	let t22;
    	let div2;
    	let current;
    	let mounted;
    	let dispose;

    	let hidden0_props = {
    		$$slots: { default: [create_default_slot_3] },
    		$$scope: { ctx }
    	};

    	hidden0 = new Hidden({ props: hidden0_props });
    	/*hidden0_binding*/ ctx[4](hidden0);
    	hidden0.$on("show", /*show_handler*/ ctx[5]);

    	let hidden1_props = {
    		$$slots: { default: [create_default_slot_2] },
    		$$scope: { ctx }
    	};

    	hidden1 = new Hidden({ props: hidden1_props });
    	/*hidden1_binding*/ ctx[6](hidden1);
    	hidden1.$on("show", /*show_handler_1*/ ctx[7]);

    	let hidden2_props = {
    		$$slots: { default: [create_default_slot_1] },
    		$$scope: { ctx }
    	};

    	hidden2 = new Hidden({ props: hidden2_props });
    	/*hidden2_binding*/ ctx[8](hidden2);
    	hidden2.$on("show", /*show_handler_2*/ ctx[9]);

    	let hidden3_props = {
    		$$slots: { default: [create_default_slot] },
    		$$scope: { ctx }
    	};

    	hidden3 = new Hidden({ props: hidden3_props });
    	/*hidden3_binding*/ ctx[10](hidden3);
    	hidden3.$on("show", /*show_handler_3*/ ctx[11]);

    	return {
    		c() {
    			div0 = element("div");

    			div0.innerHTML = `<strong>VSInterest:</strong> 
<link href="./out/compiled/helloworld.css" rel="stylesheet"/>`;

    			t2 = space();
    			p0 = element("p");
    			p0.textContent = "Here you can find Github repos of similar languages.";
    			t4 = space();
    			p1 = element("p");
    			p1.innerHTML = `Here is the <a href="https://github.com/Mehak-Mehta/VSInterest" class="svelte-1lwn8p5">Source Code </a>.`;
    			t8 = text("\r\n\r\n\r\nSelect language: \r\n\r\n\r\n");
    			button0 = element("button");
    			button0.textContent = "Python";
    			t10 = space();
    			create_component(hidden0.$$.fragment);
    			t11 = space();
    			button1 = element("button");
    			button1.textContent = "JavaScript";
    			t13 = space();
    			create_component(hidden1.$$.fragment);
    			t14 = space();
    			button2 = element("button");
    			button2.textContent = "TypeScript";
    			t16 = space();
    			create_component(hidden2.$$.fragment);
    			t17 = space();
    			button3 = element("button");
    			button3.textContent = "Html & CSS";
    			t19 = space();
    			create_component(hidden3.$$.fragment);
    			t20 = space();
    			div1 = element("div");
    			div1.textContent = "More languages coming soon!!";
    			t22 = space();
    			div2 = element("div");
    			div2.innerHTML = `Made By <a href="https://github.com/Mehak-Mehta" class="svelte-1lwn8p5">Mehak Mehta</a>`;
    			attr(div0, "class", "header svelte-1lwn8p5");
    			attr(div2, "color:", "");
    			attr(div2, "pink", "");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			insert(target, t2, anchor);
    			insert(target, p0, anchor);
    			insert(target, t4, anchor);
    			insert(target, p1, anchor);
    			insert(target, t8, anchor);
    			insert(target, button0, anchor);
    			insert(target, t10, anchor);
    			mount_component(hidden0, target, anchor);
    			insert(target, t11, anchor);
    			insert(target, button1, anchor);
    			insert(target, t13, anchor);
    			mount_component(hidden1, target, anchor);
    			insert(target, t14, anchor);
    			insert(target, button2, anchor);
    			insert(target, t16, anchor);
    			mount_component(hidden2, target, anchor);
    			insert(target, t17, anchor);
    			insert(target, button3, anchor);
    			insert(target, t19, anchor);
    			mount_component(hidden3, target, anchor);
    			insert(target, t20, anchor);
    			insert(target, div1, anchor);
    			insert(target, t22, anchor);
    			insert(target, div2, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", function () {
    						if (is_function(/*child*/ ctx[0].show)) /*child*/ ctx[0].show.apply(this, arguments);
    					}),
    					listen(button1, "click", function () {
    						if (is_function(/*classname*/ ctx[1].show)) /*classname*/ ctx[1].show.apply(this, arguments);
    					}),
    					listen(button2, "click", function () {
    						if (is_function(/*name*/ ctx[2].show)) /*name*/ ctx[2].show.apply(this, arguments);
    					}),
    					listen(button3, "click", function () {
    						if (is_function(/*hname*/ ctx[3].show)) /*hname*/ ctx[3].show.apply(this, arguments);
    					})
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, [dirty]) {
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
    		i(local) {
    			if (current) return;
    			transition_in(hidden0.$$.fragment, local);
    			transition_in(hidden1.$$.fragment, local);
    			transition_in(hidden2.$$.fragment, local);
    			transition_in(hidden3.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(hidden0.$$.fragment, local);
    			transition_out(hidden1.$$.fragment, local);
    			transition_out(hidden2.$$.fragment, local);
    			transition_out(hidden3.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t2);
    			if (detaching) detach(p0);
    			if (detaching) detach(t4);
    			if (detaching) detach(p1);
    			if (detaching) detach(t8);
    			if (detaching) detach(button0);
    			if (detaching) detach(t10);
    			/*hidden0_binding*/ ctx[4](null);
    			destroy_component(hidden0, detaching);
    			if (detaching) detach(t11);
    			if (detaching) detach(button1);
    			if (detaching) detach(t13);
    			/*hidden1_binding*/ ctx[6](null);
    			destroy_component(hidden1, detaching);
    			if (detaching) detach(t14);
    			if (detaching) detach(button2);
    			if (detaching) detach(t16);
    			/*hidden2_binding*/ ctx[8](null);
    			destroy_component(hidden2, detaching);
    			if (detaching) detach(t17);
    			if (detaching) detach(button3);
    			if (detaching) detach(t19);
    			/*hidden3_binding*/ ctx[10](null);
    			destroy_component(hidden3, detaching);
    			if (detaching) detach(t20);
    			if (detaching) detach(div1);
    			if (detaching) detach(t22);
    			if (detaching) detach(div2);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let child;
    	let classname;
    	let name;
    	let hname;

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

    class HelloWorld extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new HelloWorld({
        target: document.body,
    });

    return app;

}());
//# sourceMappingURL=helloworld.js.map
