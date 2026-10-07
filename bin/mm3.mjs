#!/usr/bin/env node
import { createRequire as __mm3CreateRequire } from 'node:module';
const require = __mm3CreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar2 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar2(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar2;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key2, node, visitor, path28) {
      const ctrl = callVisitor(key2, node, visitor, path28);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path28, ctrl);
        return visit_(key2, ctrl, visitor, path28);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path28 = Object.freeze(path28.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path28);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path28 = Object.freeze(path28.concat(node));
          const ck = visit_("key", node.key, visitor, path28);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path28);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key2, node, visitor, path28) {
      const ctrl = await callVisitor(key2, node, visitor, path28);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key2, path28, ctrl);
        return visitAsync_(key2, ctrl, visitor, path28);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path28 = Object.freeze(path28.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path28);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path28 = Object.freeze(path28.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path28);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path28);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key2, node, visitor, path28) {
      if (typeof visitor === "function")
        return visitor(key2, node, path28);
      if (identity.isMap(node))
        return visitor.Map?.(key2, node, path28);
      if (identity.isSeq(node))
        return visitor.Seq?.(key2, node, path28);
      if (identity.isPair(node))
        return visitor.Pair?.(key2, node, path28);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key2, node, path28);
      if (identity.isAlias(node))
        return visitor.Alias?.(key2, node, path28);
      return void 0;
    }
    function replaceNode(key2, path28, node) {
      const parent = path28[path28.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key2] = node;
      } else if (identity.isPair(parent)) {
        if (key2 === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line3, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line3.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key2, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len2 = val.length; i < len2; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key2, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path28, value) {
      let v = value;
      for (let i = path28.length - 1; i >= 0; --i) {
        const k = path28[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path28) => path28 == null || typeof path28 === "object" && !!path28[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path28, value) {
        if (isEmptyPath(path28))
          this.add(value);
        else {
          const [key2, ...rest] = path28;
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path28) {
        const [key2, ...rest] = path28;
        if (rest.length === 0)
          return this.delete(key2);
        const node = this.get(key2, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path28, keepScalar) {
        const [key2, ...rest] = path28;
        const node = this.get(key2, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path28) {
        const [key2, ...rest] = path28;
        if (rest.length === 0)
          return this.has(key2);
        const node = this.get(key2, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path28, value) {
        const [key2, ...rest] = path28;
        if (rest.length === 0) {
          this.set(key2, value);
        } else {
          const node = this.get(key2, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key2, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key2}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent3) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent3 ? comment.replace(/^(?! *$)/gm, indent3) : comment;
    }
    var lineComment = (str, indent3, comment) => str.endsWith("\n") ? indentComment(comment, indent3) : comment.includes("\n") ? "\n" + indentComment(comment, indent3) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent3, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent3.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent3.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent3.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent3.length);
          end = i + indent3.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent3}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent3}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent3) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent3) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent3 = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent3;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent3, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent3 = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent3}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent3, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent3 = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent3.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent3}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent3}`);
      }
      const indentSize = indent3 ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent3}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent3, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent3}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent3}`);
      return `|${header}
${indent3}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent: indent3, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent3 === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent3 === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent3}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent3, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify3(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key: key2, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent: indent3, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key2) && key2.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key2) || !identity.isNode(key2) && typeof key2 === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key2 || keyComment && value == null && !ctx.inFlow || identity.isCollection(key2) || (identity.isScalar(key2) ? key2.type === Scalar.Scalar.BLOCK_FOLDED || key2.type === Scalar.Scalar.BLOCK_LITERAL : typeof key2 === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent3 + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify3.stringify(key2, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent3}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify3.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow2 = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow2) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key2) => (merge.identify(key2) || identity.isScalar(key2) && (!key2.type || key2.type === Scalar.Scalar.PLAIN) && merge.identify(key2.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key2, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key2))
            map.set(key2, value2);
        } else if (map instanceof Set) {
          map.add(key2);
        } else if (!Object.prototype.hasOwnProperty.call(map, key2)) {
          Object.defineProperty(map, key2, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify3 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key: key2, value }) {
      if (identity.isNode(key2) && key2.addToJSMap)
        key2.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key2))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key2, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key2, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key2, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key2) && ctx?.doc) {
        const strCtx = stringify3.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key2.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key2, value, ctx) {
      const k = createNode.createNode(key2, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key2, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key2;
        this.value = value;
      }
      clone(schema) {
        let { key: key2, value } = this;
        if (identity.isNode(key2))
          key2 = key2.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key2, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow2 = ctx.inFlow ?? collection.flow;
      const stringify4 = flow2 ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify4(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent: indent3, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify3.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line3 = lines[i];
          str += line3 ? `
${indent3}${line3}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent3);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent: indent3, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify3.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line3) => sum + line3.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len2 = lines.reduce((sum, line3) => sum + line3.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len2 > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line3 of lines)
            str += line3 ? `
${indentStep}${indent3}${line3}` : "\n";
          return `${str}
${indent3}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent: indent3, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent3);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key2) {
      const k = identity.isScalar(key2) ? key2.value : key2;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key2 || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key2, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key2, value);
          else if (Array.isArray(replacer) && !replacer.includes(key2))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key2, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key2, value] of obj)
            add(key2, value);
        } else if (obj && typeof obj === "object") {
          for (const key2 of Object.keys(obj))
            add(key2, obj[key2]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key2) {
        const it = findPair(this.items, key2);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const it = findPair(this.items, key2);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key2) {
        return !!findPair(this.items, key2);
      }
      set(key2, value) {
        this.add(new Pair.Pair(key2, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key2, keepScalar) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key2) {
        const idx = asItemIndex(key2);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key2, value) {
        const idx = asItemIndex(key2);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key2}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key2 = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key2, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key2) {
      let idx = identity.isScalar(key2) ? key2.value : key2;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num3 = typeof value === "number" ? value : Number(value);
      if (!isFinite(num3))
        return isNaN(num3) ? ".nan" : num3 < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num3 = Number(node.value);
        return isFinite(num3) ? num3.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key2, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key2 = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key2 = keys[0];
              value = it[key2];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key2 = it;
          }
          pairs2.items.push(Pair.createPair(key2, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key2, value;
          if (identity.isPair(pair)) {
            key2 = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key2, ctx);
          } else {
            key2 = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key2))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key2, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key: key2 } of pairs$1.items) {
          if (identity.isScalar(key2)) {
            if (seenKeys.includes(key2.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key2.value}`);
            } else {
              seenKeys.push(key2.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num3 = Number(node.value);
        return isFinite(num3) ? num3.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key2) {
        let pair;
        if (identity.isPair(key2))
          pair = key2;
        else if (key2 && typeof key2 === "object" && "key" in key2 && "value" in key2 && key2.value === null)
          pair = new Pair.Pair(key2.key, null);
        else
          pair = new Pair.Pair(key2, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key2, keepPair) {
        const pair = YAMLMap.findPair(this.items, key2);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key2, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key2);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key2));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num3 = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num3(60) + num3(p), num3(0));
      return sign === "-" ? num3(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num3 = (n) => n;
      if (typeof value === "bigint")
        num3 = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num3(-1);
      }
      const _60 = num3(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key2) => key2 !== "yaml11").map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key2) => JSON.stringify(key2)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify3 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify3.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify3.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify3.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path28, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path28, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow: flow2, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow2 && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key2, value, options = {}) {
        const k = this.createNode(key2, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key2) {
        return assertCollection(this.contents) ? this.contents.delete(key2) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path28) {
        if (Collection.isEmptyPath(path28)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path28) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key2, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key2, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path28, keepScalar) {
        if (Collection.isEmptyPath(path28))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path28, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key2) {
        return identity.isCollection(this.contents) ? this.contents.has(key2) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path28) {
        if (Collection.isEmptyPath(path28))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path28) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key2, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key2], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key2, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path28, value) {
        if (Collection.isEmptyPath(path28)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path28), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path28, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line: line3, col } = error.linePos[0];
      error.message += ` at line ${line3}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line3 - 1], lc.lineStarts[line3]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line3 > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line3 - 2], lc.lineStarts[line3 - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line3 && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow: flow2, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow2 && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow2 ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow2) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow2}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key2) {
      if (!key2)
        return null;
      switch (key2.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key2.source.includes("\n"))
            return true;
          if (key2.end) {
            for (const st of key2.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key2.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent3, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent3 && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key: key2, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key2) {
            if (key2.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key2 && key2.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key2)) {
            onError(key2 ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key2 ? composeNode(ctx, key2, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key2, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key2 || key2.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key: key2, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key2 ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key2))
            onError(
              key2,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key2 ? composeNode(ctx, key2, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key2))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar2, onError) {
      const start = scalar2.offset;
      const header = parseBlockScalarHeader(scalar2, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar2.source ? splitLines(scalar2.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar2.source)
          end2 += scalar2.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar2.indent + header.indent;
      let offset = scalar2.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent3, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent3.length > trimIndent)
            trimIndent = indent3.length;
        } else {
          if (indent3.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent3.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent3.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent3.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent3, content] = lines[i];
        offset += indent3.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent3.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent3 = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent3.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent3.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent3.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar2.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent3 = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent3 && n)
            indent3 = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent: indent3, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m2 = first.match(/^( *)/);
      const line0 = m2?.[1] ? [m2[1], first.slice(m2[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar2, strict, onError) {
      const { offset, type, source, end } = scalar2;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar2, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line3 = /(.*?)\r?\n/sy;
      let match = line3.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line3.lastIndex;
      while (match = line3.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line3.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok2 = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok2 ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar2;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar2 = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar2 = new Scalar.Scalar(value);
      }
      scalar2.range = range;
      scalar2.source = value;
      if (type)
        scalar2.type = type;
      if (tagName)
        scalar2.tag = tagName;
      if (tag.format)
        scalar2.format = tag.format;
      if (comment)
        scalar2.comment = comment;
      return scalar2;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent: indent3, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent3 > 0 ? " ".repeat(indent3) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent: indent3, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent: indent3, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent: indent3, source: "\n" });
          return { type: "block-scalar", offset, indent: indent3, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent: indent3, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent: indent3, source, end };
        default:
          return { type: "scalar", offset, indent: indent3, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent3 = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent3 === "number")
        indent3 += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent3 === null,
        indent: indent3 !== null && indent3 > 0 ? " ".repeat(indent3) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent3 = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent: indent3, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent: indent3, source: "\n" });
        for (const key2 of Object.keys(token))
          if (key2 !== "type" && key2 !== "offset")
            delete token[key2];
        Object.assign(token, { type: "block-scalar", indent: indent3, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent3 = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key2 of Object.keys(token))
            if (key2 !== "type" && key2 !== "offset")
              delete token[key2];
          Object.assign(token, { type, indent: indent3, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify3 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key: key2, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key2)
        res += stringifyToken(key2);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path28) => {
      let item = cst;
      for (const [field, index] of path28) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path28) => {
      const parent = visit.itemAtPath(cst, path28.slice(0, -1));
      const field = path28[path28.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path28, item, visitor) {
      let ctrl = visitor(item, path28);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path28.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path28);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path28) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar2 = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar2;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent3 = 0;
          while (ch === " ")
            ch = this.buffer[++indent3 + offset];
          if (ch === "\r") {
            const next = this.buffer[indent3 + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent3 + 1;
          }
          return ch === "\n" || indent3 >= this.indentNext || !ch && !this.atEnd ? offset + indent3 : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line3 = this.getLine();
        if (line3 === null)
          return this.setNext("stream");
        if (line3[0] === cst.BOM) {
          yield* this.pushCount(1);
          line3 = line3.substring(1);
        }
        if (line3[0] === "%") {
          let dirEnd = line3.length;
          let cs = line3.indexOf("#");
          while (cs !== -1) {
            const ch = line3[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line3.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line3[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line3.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line3.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line3 = this.getLine();
        if (line3 === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line3[n]) {
          case "#":
            yield* this.pushCount(line3.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line3.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent3 = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent3 = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line3 = this.getLine();
        if (line3 === null)
          return this.setNext("flow");
        if (indent3 !== -1 && indent3 < this.indentNext && line3[0] !== "#" || indent3 === 0 && (line3.startsWith("---") || line3.startsWith("...")) && isEmpty(line3[3])) {
          const atFlowEndMarker = indent3 === this.indentNext - 1 && this.flowLevel === 1 && (line3[0] === "]" || line3[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line3[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line3[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line3.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent3 = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent3 += 1;
              break;
            case "\n":
              nl = i2;
              indent3 = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent3 >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent3;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent3 > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list3, type) {
      for (let i = 0; i < list3.length; ++i)
        if (list3[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list3) {
      for (let i = 0; i < list3.length; ++i) {
        switch (list3[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar2) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar2.end) {
            sep = scalar2.end;
            sep.push(this.sourceToken);
            delete scalar2.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar2.offset,
            indent: scalar2.indent,
            items: [{ start, key: scalar2, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar2);
      }
      *blockScalar(scalar2) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar2.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar2.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key2 = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: key2, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent3) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent3)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument6(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument6(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify3(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent3 = Math.round(options);
        options = indent3 < 1 ? void 0 : indent3 > 8 ? { indent: 8 } : { indent: indent3 };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument6;
    exports.stringify = stringify3;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
var import_yaml6 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync25, realpathSync as realpathSync8, statSync as statSync5 } from "node:fs";
import os3 from "node:os";
import path27 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { parseArgs } from "node:util";

// package.json
var package_default = {
  name: "@mvpscale/mm3",
  version: "0.1.3",
  description: "MM3, make and model for coding agents: MAK\xB3 uses what is proven, MDL\xB3 learns what is missing, with compact yes/no checklists, a calibrated consensus, and a log that learns where agents go wrong.",
  license: "Apache-2.0",
  type: "module",
  repository: {
    type: "git",
    url: "git+https://github.com/mvp-scale/mm3.git"
  },
  homepage: "https://github.com/mvp-scale/mm3#readme",
  keywords: [
    "agents",
    "claude-code",
    "codex",
    "gemini-cli",
    "mcp",
    "agent-skills",
    "decision-support"
  ],
  engines: {
    node: ">=22.13"
  },
  bin: {
    mm3: "dist/cli.js"
  },
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  files: [
    "dist",
    "bin/mm3.mjs",
    "skills",
    ".claude-plugin",
    "hooks",
    "README.md",
    "LICENSE"
  ],
  publishConfig: {
    access: "public",
    provenance: true
  },
  scripts: {
    build: "tsc -p tsconfig.build.json",
    "build:plugin": "tsx scripts/build-plugin.ts",
    "build:binary": "tsx scripts/build-binary.ts",
    parity: "tsx scripts/parity.ts",
    "parity:install": "tsx scripts/parity-install.ts",
    "build:site": "tsx scripts/build-site.ts",
    typecheck: "tsc -p tsconfig.json --noEmit",
    test: "vitest run --project unit --project contract --project golden",
    "test:cli": "npm run build && vitest run --project cli",
    "test:install": "npm run build && vitest run --project install",
    "test:chaos": "npm run build && tsx test/chaos/run.ts",
    "test:container": "sh test/docker/test.sh",
    "test:flows": "sh scripts/flows.sh",
    "bench:ledger": "tsx scripts/bench-ledger.ts",
    "bench:tokens": "tsx scripts/bench-tokens.ts",
    mm3: "tsx src/cli.ts",
    "check:clean": "sh scripts/check-clean.sh",
    "check:trace": "tsx scripts/trace.ts",
    "check:pack": "tsx scripts/check-pack.ts",
    "check:plugin": "tsx scripts/check-plugin.ts",
    "check:hygiene": "tsx scripts/check-hygiene.ts",
    "check:readme": "npm run build && tsx scripts/check-readme.ts",
    "judge:readme": "node bin/mm3.mjs class scripts/readme-judgment.yaml",
    "gen:evidence-index": "tsx scripts/evidence-index.ts",
    prepare: "git config core.hooksPath .github/hooks 2>/dev/null || true",
    "dev:install": 'npm run build && tgz="$(pwd)/$(npm pack --silent | tail -1)" && cd "${INIT_CWD:-.}" && npx --yes --package "$tgz" mm3 init',
    "check:node-floor": "tsc -p tsconfig.node-floor.json",
    "guidance:accept": "npm run build && tsx scripts/guidance-snapshot.ts && MM3_ACCEPT_GUIDANCE=1 vitest run --project cli test/e2e/cli/stop-recovery.test.ts",
    "check:agentic": "tsx scripts/check-agentic.ts",
    "agentic:context": "tsx scripts/agentic/context.ts",
    "agentic:run": "tsx scripts/agentic/run.ts",
    ceremony: "tsx scripts/ceremony.ts",
    release: "tsx scripts/release.ts",
    "agentic:sheet": "tsx scripts/agentic/sheet.ts",
    "agentic:runs": "tsx scripts/agentic/runs.ts",
    "agentic:compare": "tsx scripts/agentic/compare.ts",
    "agentic:trace": "tsx scripts/agentic/trace.ts",
    "agentic:release-report": "tsx scripts/agentic/release-report.ts",
    "agentic:patterns": "tsx scripts/agentic/patterns.ts",
    "agentic:feature": "tsx scripts/agentic/trial.ts"
  },
  devDependencies: {
    "@types-floor/node": "npm:@types/node@22.19.18",
    "@types/node": "26.6.3",
    ajv: "8.20.0",
    esbuild: "0.28.2",
    "js-tiktoken": "1.0.21",
    tsx: "4.23.15",
    typescript: "7.0.2",
    vitest: "5.0.3"
  },
  dependencies: {
    yaml: "2.9.1"
  }
};

// src/budget/budget.ts
import { existsSync as existsSync4, readFileSync as readFileSync6 } from "node:fs";

// src/config/defaults.ts
function deepFreeze(value) {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
var DEFAULT_CONFIG = deepFreeze({
  budget: { usd: 5, runs: 500, per: "total", warnAt: 0.8 },
  pricing: {
    "jev-1.13.0": { inputPerMTok: 42 / 1e3 }
    // $42/Btok = $0.042/Mtok (docs.typesafe.ai/models.md) — see answers.ts
  },
  timeoutMs: 2e4,
  retries: 2,
  backoffMs: 1e3,
  sweep: { maxQuestionsPerCall: 500, itemsPerLayer: { quick: 10, standard: 20, thorough: 30 } },
  requestMaxBytes: 1048576,
  reuse: {},
  mdl: {},
  depth: { class: [3, 6, 9], scan: [3, 6, 9], loop: [3, 6, 9] },
  evidence: { perItemChars: 2e4, totalChars: 6e4, maxFiles: 500 },
  lens: { concernAt: 0.5, weakBelow: 0.35, strongAt: 0.8 }
});
var UNSET_BY_DEFAULT = ["provider", "baseURL", "model", "budget.since", "sweep.maxItems", "reuse.maxAgeDays", "reuse.maxCommits"];
var KEYED_MAPS = ["pricing", "mdl"];
var CONFIG_KEYS = ["budget", "provider", "baseURL", "model", "pricing", "timeoutMs", "retries", "backoffMs", "sweep", "requestMaxBytes", "reuse", "depth", "evidence", "lens", "mdl"];
var CONTRACT_ONLY_KEYS = ["goal", "where", "ask", "over", "mdl.parent"];
var SECRET_LIKE_KEYS = ["apikey", "api_key", "key", "token", "secret", "password", "credential", "credentials"];

// src/config/load.ts
import { existsSync, readFileSync } from "node:fs";

// src/config/parse.ts
var import_yaml = __toESM(require_dist(), 1);

// src/ledger/redact.ts
var MIN_SECRET_LEN = 8;
var registeredSecrets = [];
function registerSecret(value) {
  const v = value?.trim();
  if (v && v.length >= MIN_SECRET_LEN && !registeredSecrets.includes(v)) registeredSecrets = [...registeredSecrets, v];
}
var PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // A key with no END line (cut off by a line range, or pasted in part) is redacted to the end: fail closed.
  /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]{0,40}PRIVATE KEY-----|[\s\S]*)/g
];
var EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
var KEY_VALUE = /(?<![A-Za-z0-9])([A-Za-z0-9_]{0,64}(?:api[_-]?key|token|secret|password|passwd)[A-Za-z0-9_]{0,64})(['"]?)(\s*[:=]\s*)(['"]?)(?![{[])[^\s'"]{8,}\4/gi;
var BEARER = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
function redactSecrets(text) {
  let out = text.replace(KEY_VALUE, (_m, key2, quote, sep) => `${key2}${quote}${sep}[redacted]`);
  out = out.replace(BEARER, (_m, word) => `${word} [redacted]`);
  for (const p of PATTERNS) out = out.replace(p, "[redacted]");
  for (const s of registeredSecrets) if (out.includes(s)) out = out.split(s).join("[redacted]");
  return out;
}
function redact(text) {
  return redactSecrets(text).replace(EMAIL, "[redacted]");
}
function looksLikeSecret(value) {
  if (registeredSecrets.some((s) => value.includes(s))) return true;
  return PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(value);
  });
}
function redactDeep(value) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k), redactDeep(v)]));
  }
  return value;
}

// src/contract/types.ts
var VERBS = ["view", "class", "replay", "scan", "drill", "loop"];
var DEPTHS = ["quick", "standard", "thorough"];
var DEPTH_COUNT = {
  quick: DEFAULT_CONFIG.depth.class[0] * 3,
  standard: DEFAULT_CONFIG.depth.class[1] * 3,
  thorough: DEFAULT_CONFIG.depth.class[2] * 3
};
var SWEEP_ITEM_CAP = { ...DEFAULT_CONFIG.sweep.itemsPerLayer };
var WHYS = ["validate", "find", "debug"];
var AREAS = ["data", "api", "ui", "auth", "hosting", "build", "tests"];
var STAGES = ["design", "build", "review", "pre-merge", "post-fix", "release", "operate"];
var CHANGES = ["feature", "fix", "refactor", "dependency", "config"];
var RISKS = ["low", "medium", "high"];
var DECISIONS_MIN = 2;
var DECISIONS_MAX = 5;
var FAMILIES = ["access", "injection", "secrets", "input", "output", "availability", "correctness", "design", "design-risk", "done", "other"];
var BLASTS = ["code", "component", "container", "system", "person"];

// src/config/validate.ts
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function distance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
function didYouMean(given, known) {
  let best;
  for (const name of known) {
    const d = distance(given, name);
    if (d <= 2 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name;
}
function stop(path28, problem, fix) {
  return { path: path28, text: `\u2716 config.${path28}: ${problem} \u2192 ${fix}` };
}
function checkSecretLike(key2, path28, out) {
  if (SECRET_LIKE_KEYS.includes(key2.toLowerCase())) {
    out.push(stop(path28, "looks like it holds a secret", "keys go in env or the keychain, never in config.yaml"));
    return true;
  }
  return false;
}
function checkEnum(path28, v, allowed, out) {
  if (typeof v === "string" && allowed.includes(v)) return true;
  out.push(stop(path28, `${JSON.stringify(v)} is not valid`, `use one of ${allowed.join(", ")}`));
  return false;
}
function checkPositiveNumber(path28, v, out) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return true;
  out.push(stop(path28, `${JSON.stringify(v)} is not a positive number`, "give a number greater than 0"));
  return false;
}
function checkWhole(path28, v, out) {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1) return true;
  out.push(stop(path28, `${JSON.stringify(v)} is not allowed`, "use a whole number of at least 1"));
  return false;
}
function checkShare(path28, v, out) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1) return true;
  out.push(stop(path28, `${JSON.stringify(v)} is not allowed`, "use a number above 0 and below 1, e.g. 0.5"));
  return false;
}
function checkSecretValue(path28, v, out) {
  if (!looksLikeSecret(v)) return false;
  out.push(stop(path28, "looks like a key", "keys go in env (TYPESAFE_API_KEY) or the keychain, never in config"));
  return true;
}
function checkNonEmptyString(path28, v, out) {
  if (typeof v !== "string" || !v.trim()) {
    out.push(stop(path28, `${JSON.stringify(v)} is not text`, "give a non-empty string"));
    return false;
  }
  if (checkSecretValue(path28, v, out)) return false;
  return true;
}
var isEmptySection = (v) => v === null || v === void 0;
function checkBudget(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("budget", "is not a mapping", "write usd:, runs:, per: and/or warnAt: under budget:"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `budget.${k}`;
    if (checkSecretLike(k, path28, out)) continue;
    if (k === "usd" || k === "runs") {
      if (checkPositiveNumber(path28, v[k], out)) result[k] = v[k];
    } else if (k === "per") {
      if (checkEnum(path28, v[k], ["total", "day", "hour"], out)) result.per = v[k];
    } else if (k === "since") {
      if (checkNonEmptyString(path28, v[k], out)) result.since = v[k];
    } else if (k === "warnAt") {
      const n = v[k];
      if (typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1) result.warnAt = n;
      else out.push(stop(path28, `${JSON.stringify(n)} is not allowed`, "use a share above 0 and up to 1, e.g. 0.8 warns at 80% of a cap"));
    } else {
      const hint = didYouMean(k, ["usd", "runs", "per", "since", "warnAt"]);
      out.push(stop(path28, `"${k}" is not a budget field`, hint ? `did you mean ${hint}?` : "use usd, runs, per, since or warnAt"));
    }
  }
  return result;
}
function checkPricing(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("pricing", "is not a mapping", "write <model>: {inputPerMTok: <n>} under pricing:"));
    return {};
  }
  const result = {};
  for (const model of Object.keys(v)) {
    const rate = v[model];
    const path28 = `pricing.${model}`;
    if (isEmptySection(rate)) continue;
    if (!isObj(rate)) {
      out.push(stop(path28, "is not a mapping", "write {inputPerMTok, outputPerMTok, perSecond, perCall}"));
      continue;
    }
    const entry = {};
    for (const k of ["inputPerMTok", "outputPerMTok", "perSecond", "perCall"]) {
      if (k in rate) {
        if (checkPositiveNumber(`${path28}.${k}`, rate[k], out)) entry[k] = rate[k];
      }
    }
    for (const k of Object.keys(rate)) {
      if (!["inputPerMTok", "outputPerMTok", "perSecond", "perCall"].includes(k)) {
        checkSecretLike(k, `${path28}.${k}`, out) || out.push(stop(`${path28}.${k}`, `"${k}" is not a pricing field`, "use inputPerMTok, outputPerMTok, perSecond or perCall"));
      }
    }
    result[model] = entry;
  }
  return result;
}
function checkSweep(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("sweep", "is not a mapping", "write maxItems:, maxQuestionsPerCall: and/or itemsPerLayer: under sweep:"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `sweep.${k}`;
    if (k === "maxItems" || k === "maxQuestionsPerCall") {
      if (checkPositiveNumber(path28, v[k], out)) result[k] = v[k];
    } else if (k === "itemsPerLayer") {
      const per = checkTierCounts(path28, v[k], ITEM_TIERS, out);
      if (per) result.itemsPerLayer = per;
    } else {
      const hint = didYouMean(k, ["maxItems", "maxQuestionsPerCall", "itemsPerLayer"]);
      out.push(stop(path28, `"${k}" is not a sweep field`, hint ? `did you mean ${hint}?` : "use maxItems, maxQuestionsPerCall or itemsPerLayer"));
    }
  }
  return result;
}
function checkReuse(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("reuse", "is not a mapping", "write maxAgeDays: and/or maxCommits: under reuse:"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `reuse.${k}`;
    if (k === "maxAgeDays" || k === "maxCommits") {
      if (checkPositiveNumber(path28, v[k], out)) result[k] = v[k];
    } else {
      const hint = didYouMean(k, ["maxAgeDays", "maxCommits"]);
      out.push(stop(path28, `"${k}" is not a reuse field`, hint ? `did you mean ${hint}?` : "use maxAgeDays or maxCommits"));
    }
  }
  return result;
}
var ITEM_TIERS = ["quick", "standard", "thorough"];
function checkTierCounts(path28, v, tiers, out) {
  if (isEmptySection(v)) return void 0;
  if (!isObj(v)) {
    out.push(stop(path28, "is not a mapping", `write ${tiers.join(": <n>, ")}: <n> under it`));
    return void 0;
  }
  const result = {};
  for (const k of Object.keys(v)) {
    if (!tiers.includes(k)) {
      const hint = didYouMean(k, tiers);
      out.push(stop(`${path28}.${k}`, `"${k}" is not a depth tier`, hint ? `did you mean ${hint}?` : `use ${tiers.join(", ")}`));
    } else if (checkWhole(`${path28}.${k}`, v[k], out)) result[k] = v[k];
  }
  return result;
}
var DEPTH_VERBS = ["class", "scan", "loop"];
var NO_DEPTH_VERBS = ["drill", "replay", "view"];
function checkTiers(path28, v, out) {
  if (!Array.isArray(v)) {
    out.push(stop(path28, `${JSON.stringify(v)} is not a list`, "write three whole numbers, quick to thorough, e.g. [3, 6, 9]"));
    return void 0;
  }
  if (v.length !== 3) {
    out.push(stop(path28, `${v.length} number${v.length === 1 ? "" : "s"} given`, "give exactly 3: quick, standard, thorough, e.g. [3, 6, 9]"));
    return void 0;
  }
  let ok2 = true;
  v.forEach((n, i) => {
    if (typeof n === "number" && Number.isInteger(n) && n >= 1) return;
    out.push(stop(`${path28}[${i}]`, `${JSON.stringify(n)} is not allowed`, "use whole numbers of at least 1, ascending"));
    ok2 = false;
  });
  if (!ok2) return void 0;
  const t = v;
  if (!(t[0] <= t[1] && t[1] <= t[2])) {
    out.push(stop(path28, `[${t.join(", ")}] is not ascending`, "make quick <= standard <= thorough, e.g. [3, 6, 9]"));
    return void 0;
  }
  return t;
}
function checkDepth(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("depth", "is not a mapping", "write class:, scan: and/or loop: under depth:, each a list like [3, 6, 9]"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `depth.${k}`;
    if (DEPTH_VERBS.includes(k)) {
      const t = checkTiers(path28, v[k], out);
      if (t) result[k] = t;
    } else if (NO_DEPTH_VERBS.includes(k)) {
      out.push(stop(path28, `${k} has no depth setting`, "set depth for class, scan or loop only"));
    } else {
      const hint = didYouMean(k, DEPTH_VERBS);
      out.push(stop(path28, `"${k}" is not a verb with a depth`, hint ? `did you mean ${hint}?` : "use class, scan or loop"));
    }
  }
  return result;
}
var EVIDENCE_FIELDS = ["perItemChars", "totalChars", "maxFiles"];
function checkEvidence(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("evidence", "is not a mapping", "write perItemChars:, totalChars: and/or maxFiles: under evidence:"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `evidence.${k}`;
    if (EVIDENCE_FIELDS.includes(k)) {
      if (checkWhole(path28, v[k], out)) result[k] = v[k];
    } else {
      const hint = didYouMean(k, EVIDENCE_FIELDS);
      out.push(stop(path28, `"${k}" is not an evidence field`, hint ? `did you mean ${hint}?` : `use ${EVIDENCE_FIELDS.join(", ")}`));
    }
  }
  return result;
}
var LENS_FIELDS = ["concernAt", "weakBelow", "strongAt"];
function checkLens(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("lens", "is not a mapping", "write concernAt:, weakBelow: and/or strongAt: under lens:"));
    return {};
  }
  const result = {};
  for (const k of Object.keys(v)) {
    const path28 = `lens.${k}`;
    if (LENS_FIELDS.includes(k)) {
      if (checkShare(path28, v[k], out)) result[k] = v[k];
    } else {
      const hint = didYouMean(k, LENS_FIELDS);
      out.push(stop(path28, `"${k}" is not a lens field`, hint ? `did you mean ${hint}?` : `use ${LENS_FIELDS.join(", ")}`));
    }
  }
  return result;
}
function checkRelations(value, out) {
  const per = value.sweep?.itemsPerLayer;
  if (per) {
    const eff = { ...DEFAULT_CONFIG.sweep.itemsPerLayer, ...per };
    if (!(eff.quick <= eff.standard && eff.standard <= eff.thorough)) {
      out.push(stop("sweep.itemsPerLayer", `quick ${eff.quick}, standard ${eff.standard}, thorough ${eff.thorough} is not ascending`, "make quick <= standard <= thorough"));
      delete value.sweep.itemsPerLayer;
    }
  }
  const ev = value.evidence;
  if (ev) {
    const eff = { ...DEFAULT_CONFIG.evidence, ...ev };
    if (eff.perItemChars > eff.totalChars) {
      out.push(stop("evidence", `perItemChars ${eff.perItemChars} is larger than totalChars ${eff.totalChars}`, "make perItemChars no larger than totalChars"));
      delete value.evidence;
    }
  }
  const lens = value.lens;
  if (lens) {
    const eff = { ...DEFAULT_CONFIG.lens, ...lens };
    if (!(eff.weakBelow < eff.concernAt && eff.concernAt < eff.strongAt)) {
      out.push(stop("lens", `weakBelow ${eff.weakBelow}, concernAt ${eff.concernAt}, strongAt ${eff.strongAt} is out of order`, "keep weakBelow below concernAt below strongAt"));
      delete value.lens;
    }
  }
  const maxQ = value.sweep?.maxQuestionsPerCall ?? DEFAULT_CONFIG.sweep.maxQuestionsPerCall;
  for (const verb of DEPTH_VERBS) {
    const tiers = value.depth?.[verb];
    if (tiers && 3 * tiers[2] + DECISIONS_MAX > maxQ) {
      out.push(stop(`depth.${verb}`, `thorough ${tiers[2]} asks ${3 * tiers[2]} questions plus up to ${DECISIONS_MAX} decisions, more than sweep.maxQuestionsPerCall (${maxQ})`, "lower the thorough number, or raise sweep.maxQuestionsPerCall"));
      delete value.depth[verb];
    }
  }
}
var MDL_OVERRIDE_FIELDS = ["values", "note", "as", "pattern", "link", "literal"];
function checkMdl(v, out) {
  if (isEmptySection(v)) return {};
  if (!isObj(v)) {
    out.push(stop("mdl", "is not a mapping", 'write <field>: {values: [...], note: "..."} under mdl:'));
    return {};
  }
  const result = {};
  for (const field of Object.keys(v)) {
    const override = v[field];
    const path28 = `mdl.${field}`;
    if (isEmptySection(override)) continue;
    if (!isObj(override)) {
      out.push(stop(path28, "is not a mapping", "write {values?, note?, as?, pattern?, link?, literal?}"));
      continue;
    }
    const entry = {};
    for (const k of Object.keys(override)) {
      if (!MDL_OVERRIDE_FIELDS.includes(k)) {
        const hint = didYouMean(k, MDL_OVERRIDE_FIELDS);
        out.push(stop(`${path28}.${k}`, `"${k}" is not an mdl override field`, hint ? `did you mean ${hint}?` : `use ${MDL_OVERRIDE_FIELDS.join(", ")}`));
        continue;
      }
      const val = override[k];
      if (typeof val === "string" && checkSecretValue(`${path28}.${k}`, val, out)) continue;
      if (Array.isArray(val) && val.some((x) => typeof x === "string" && looksLikeSecret(x))) {
        out.push(stop(`${path28}.${k}`, "looks like a key", "keys go in env (TYPESAFE_API_KEY) or the keychain, never in config"));
        continue;
      }
      entry[k] = val;
    }
    result[field] = entry;
  }
  return result;
}
function validateConfig(raw) {
  const out = [];
  if (!isObj(raw)) {
    out.push(stop("", "is not a mapping", "write budget:, provider: etc. as top-level keys"));
    return { stops: out, value: {} };
  }
  const value = {};
  for (const key2 of Object.keys(raw)) {
    if (checkSecretLike(key2, key2, out)) continue;
    if (CONTRACT_ONLY_KEYS.includes(key2)) {
      out.push(stop(key2, "is a request field, not a project setting", "not configurable (request contract) \u2192 set it per request"));
      continue;
    }
    if (!CONFIG_KEYS.includes(key2)) {
      const hint = didYouMean(key2, CONFIG_KEYS);
      out.push(stop(key2, `"${key2}" is not a config key`, hint ? `did you mean ${hint}?` : `use one of ${CONFIG_KEYS.join(", ")}`));
      continue;
    }
    const v = raw[key2];
    switch (key2) {
      case "budget":
        value.budget = checkBudget(v, out);
        break;
      case "provider":
        if (checkNonEmptyString("provider", v, out)) value.provider = v;
        break;
      case "baseURL":
        if (checkNonEmptyString("baseURL", v, out)) value.baseURL = v;
        break;
      case "model":
        if (checkNonEmptyString("model", v, out)) value.model = v;
        break;
      case "pricing":
        value.pricing = checkPricing(v, out);
        break;
      case "timeoutMs":
      case "retries":
      case "backoffMs":
      case "requestMaxBytes":
        if (checkPositiveNumber(key2, v, out)) value[key2] = v;
        break;
      case "sweep":
        value.sweep = checkSweep(v, out);
        break;
      case "reuse":
        value.reuse = checkReuse(v, out);
        break;
      case "depth":
        value.depth = checkDepth(v, out);
        break;
      case "evidence":
        value.evidence = checkEvidence(v, out);
        break;
      case "lens":
        value.lens = checkLens(v, out);
        break;
      case "mdl":
        value.mdl = checkMdl(v, out);
        break;
    }
  }
  checkRelations(value, out);
  return { stops: out, value };
}

// src/config/parse.ts
function parseConfigText(text) {
  const doc = (0, import_yaml.parseDocument)(text, { version: "1.2", schema: "core", uniqueKeys: true });
  const first = doc.errors[0];
  if (first) {
    const line3 = first.linePos?.[0]?.line ?? 1;
    return { raw: void 0, stops: [{ path: "", text: `\u2716 config: line ${line3} of config.yaml does not parse \u2192 fix the YAML syntax` }] };
  }
  let value;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { raw: void 0, stops: [{ path: "", text: "\u2716 config: too many aliases (*) in config.yaml \u2192 write it out in full" }] };
  }
  if (value === null || value === void 0) return { raw: {}, stops: [] };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { raw: void 0, stops: [{ path: "", text: "\u2716 config: config.yaml is not a YAML mapping \u2192 write budget:, provider: etc. as top-level keys" }] };
  }
  return { raw: value, stops: [] };
}
function checkConfigText(text) {
  const file = parseConfigText(text);
  if (file.raw === void 0) return { stops: file.stops, overrides: {}, parsed: false };
  const validated = validateConfig(file.raw);
  return { stops: [...file.stops, ...validated.stops], overrides: validated.value, parsed: true };
}
function hasSettings(text) {
  const { raw } = parseConfigText(text);
  if (raw === void 0) return true;
  const live = (v) => v !== null && v !== void 0 && (typeof v === "object" ? Object.values(v).some(live) : true);
  return live(raw);
}

// src/config/load.ts
function readConfigFile(paths) {
  if (!paths || !existsSync(paths.config)) return { raw: void 0, stops: [], present: false };
  let text;
  try {
    text = readFileSync(paths.config, "utf8");
  } catch {
    return { raw: void 0, stops: [], present: false };
  }
  return { ...parseConfigText(text), present: true };
}
var cleanEnv = (v) => {
  const t = v?.trim();
  return t ? t : void 0;
};
function positiveOr(v, fallback) {
  return v !== void 0 && Number.isFinite(v) && v > 0 ? v : fallback;
}
var isTree = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var KEYED = new Set(KEYED_MAPS);
var cloneValue = (v) => Array.isArray(v) ? v.slice() : v;
var DEFAULT_SOURCE_KEYS = [];
function labelDefaults(tree, path28) {
  const keyed = KEYED.has(path28);
  for (const k in tree) {
    const at = path28 ? `${path28}.${k}` : k;
    if (!keyed && isTree(tree[k])) labelDefaults(tree[k], at);
    else DEFAULT_SOURCE_KEYS.push(at);
  }
}
labelDefaults(DEFAULT_CONFIG, "");
DEFAULT_SOURCE_KEYS.push(...UNSET_BY_DEFAULT);
function overlay(base, over, at, inKeyedMap, sources) {
  if (!inKeyedMap && isTree(over) && (isTree(base) || KEYED.has(at))) return mergeTree(isTree(base) ? base : {}, over, at, sources);
  sources[at] = "config";
  return cloneValue(over);
}
function mergeTree(base, over, path28, sources) {
  const out = {};
  const keyed = KEYED.has(path28);
  const at = (k) => path28 ? `${path28}.${k}` : k;
  for (const k in base) out[k] = over[k] === void 0 ? base[k] : overlay(base[k], over[k], at(k), keyed, sources);
  for (const k in over) if (!(k in base) && over[k] !== void 0) out[k] = overlay(void 0, over[k], at(k), keyed, sources);
  return out;
}
function mergeConfig(overrides) {
  const sources = {};
  for (const key2 of DEFAULT_SOURCE_KEYS) sources[key2] = "default";
  const config = mergeTree(DEFAULT_CONFIG, overrides, "", sources);
  return { config, sources };
}
function resolveConfig(paths, env = {}) {
  const file = readConfigFile(paths);
  const validated = file.raw !== void 0 ? validateConfig(file.raw) : { stops: [], value: {} };
  const overrides = validated.value;
  const stops = [...file.stops, ...validated.stops];
  const present = file.present;
  const envProvider = cleanEnv(env.MM3_PROVIDER);
  const envBaseURL = cleanEnv(env.TYPESAFE_BASE_URL);
  const envModel = cleanEnv(env.JEV_MODEL);
  const envTimeoutRaw = Number(cleanEnv(env.JEV_TIMEOUT_MS));
  const envTimeout = Number.isFinite(envTimeoutRaw) && envTimeoutRaw > 0 ? envTimeoutRaw : void 0;
  const { config, sources } = mergeConfig(overrides);
  const envSet = { provider: envProvider !== void 0, baseURL: envBaseURL !== void 0, model: envModel !== void 0, timeoutMs: envTimeout !== void 0 };
  for (const [path28, isSet] of Object.entries(envSet)) if (isSet) sources[path28] = "env";
  return { config, sources, stops, present };
}
function configOf(ctx) {
  return ctx.config ?? resolveConfig(ctx.paths, ctx.env);
}
function classifierFileConfig(config) {
  return {
    ...config.provider !== void 0 ? { provider: config.provider } : {},
    ...config.baseURL !== void 0 ? { baseURL: config.baseURL } : {},
    ...config.model !== void 0 ? { model: config.model } : {},
    timeoutMs: positiveOr(config.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    retries: positiveOr(config.retries, DEFAULT_CONFIG.retries),
    backoffMs: positiveOr(config.backoffMs, DEFAULT_CONFIG.backoffMs)
  };
}

// src/config/write.ts
var import_yaml2 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";

// src/ledger/lock.ts
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync as readFileSync2, statSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
var LockError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LockError";
  }
};
var StoreError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "StoreError";
  }
};
var shownStore = (file) => `${path.basename(path.dirname(file))}/${path.basename(file)}`;
function storeError(e, file, action) {
  const code = e?.code;
  if (typeof code !== "string") return e;
  return new StoreError(`\u2716 files: cannot ${action} ${shownStore(file)} (${code}) \u2192 make .mm3/ a writable folder, with log.jsonl and budget.json as files`);
}
function onStore(file, action, fn) {
  try {
    return fn();
  } catch (e) {
    throw storeError(e, file, action);
  }
}
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== "ESRCH";
  }
}
var DEAD_PID_GRACE_MS = 2e3;
var ORPHAN_BREAK_MS = 2e3;
var errno = (e) => e?.code;
var isAbsent = (e) => errno(e) === "ENOENT" || errno(e) === "ENOTDIR";
var notALock = (lockPath) => new StoreError(`\u2716 files: ${shownStore(lockPath)} is not a lock file \u2192 remove it`);
function readLock(lockPath) {
  let fd;
  try {
    fd = openSync(lockPath, "r");
    const st = fstatSync(fd);
    if (!st.isFile()) throw notALock(lockPath);
    return { body: readFileSync2(fd, "utf8"), ageMs: Date.now() - st.mtimeMs };
  } catch (e) {
    if (e instanceof StoreError) throw e;
    if (errno(e) === "ENOENT") return void 0;
    throw notALock(lockPath);
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function isStale(lock, staleMs) {
  const pid = Number.parseInt(lock.body.trim(), 10);
  if (Number.isInteger(pid) && pid > 0) return lock.ageMs >= DEAD_PID_GRACE_MS && !isAlive(pid);
  return lock.ageMs > staleMs;
}
function tryBreak(lockPath, staleMs) {
  const breakPath = `${lockPath}.break`;
  const first = readLock(lockPath);
  if (!first) return true;
  if (!isStale(first, staleMs)) return false;
  try {
    closeSync(openSync(breakPath, "wx"));
  } catch (e) {
    if (errno(e) !== "EEXIST") throw storeError(e, breakPath, "write");
    try {
      if (Date.now() - statSync(breakPath).mtimeMs > ORPHAN_BREAK_MS) unlinkSync(breakPath);
    } catch {
    }
    return false;
  }
  try {
    const now = readLock(lockPath);
    if (!now) return true;
    if (!isStale(now, staleMs)) return false;
    try {
      unlinkSync(lockPath);
    } catch (e) {
      if (errno(e) !== "ENOENT") throw storeError(e, lockPath, "write");
    }
    return true;
  } finally {
    try {
      unlinkSync(breakPath);
    } catch {
    }
  }
}
function withLock(lockPath, fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5e3;
  const staleMs = opts.staleMs ?? 3e4;
  onStore(lockPath, "write", () => mkdirSync(path.dirname(lockPath), { recursive: true }));
  const start = Date.now();
  for (; ; ) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeSync(fd, `${process.pid}
`);
        closeSync(fd);
      } catch (e) {
        try {
          closeSync(fd);
        } catch {
        }
        unlinkSync(lockPath);
        throw storeError(e, lockPath, "write");
      }
      break;
    } catch (e) {
      if (e instanceof StoreError) throw e;
      if (e.code !== "EEXIST") throw storeError(e, lockPath, "write");
      if (tryBreak(lockPath, staleMs)) continue;
      if (Date.now() - start > timeoutMs) {
        throw new LockError(`\u2716 lock: ${shownStore(lockPath)} is locked \u2192 wait for the other run, or delete the lock file if no run is active`);
      }
      sleepSync(25);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
    }
  }
}

// src/ledger/paths.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, writeFileSync } from "node:fs";
import path2 from "node:path";
function pathsFor(root) {
  const dir = path2.join(root, ".mm3");
  return {
    root,
    dir,
    log: path2.join(dir, "log.jsonl"),
    lock: path2.join(dir, "lock"),
    budget: path2.join(dir, "budget.json"),
    index: path2.join(dir, "index.db"),
    config: path2.join(dir, "config.yaml")
  };
}
function ensureDir(paths) {
  mkdirSync2(paths.dir, { recursive: true });
  const gitignore = path2.join(paths.dir, ".gitignore");
  try {
    writeFileSync(gitignore, "*\n!config.yaml\n", { flag: "wx" });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
function findRoot(cwd) {
  let dir = path2.resolve(cwd);
  for (; ; ) {
    if (existsSync2(path2.join(dir, ".mm3")) || existsSync2(path2.join(dir, ".git"))) return dir;
    const up = path2.dirname(dir);
    if (up === dir) return void 0;
    dir = up;
  }
}
function resolvePaths(cwd = process.cwd(), env = process.env) {
  const home = env.MM3_HOME?.trim();
  const root = home ? path2.resolve(home) : findRoot(cwd);
  return root === void 0 ? void 0 : pathsFor(root);
}

// src/config/write.ts
function setDeep(doc, prefix, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    for (let i = 1; i < prefix.length; i++) {
      const parent = prefix.slice(0, i);
      const node = doc.getIn(parent, true);
      if (node === null || (0, import_yaml2.isScalar)(node) && node.value === null) {
        const map = doc.createNode({});
        if ((0, import_yaml2.isScalar)(node)) {
          if (node.comment !== void 0) map.comment = node.comment;
          if (node.commentBefore !== void 0) map.commentBefore = node.commentBefore;
        }
        doc.setIn(parent, map);
      }
    }
    doc.setIn(prefix, value);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (v !== void 0) setDeep(doc, [...prefix, k], v);
  }
}
function writeConfigOverride(paths, patch) {
  onStore(paths.config, "write", () => {
    ensureDir(paths);
    let text = "";
    try {
      text = readFileSync3(paths.config, "utf8");
    } catch (e) {
      if (!isAbsent(e)) throw e;
    }
    const doc = (0, import_yaml2.parseDocument)(text, { version: "1.2", schema: "core" });
    setDeep(doc, [], patch);
    writeFileSync2(paths.config, doc.toString());
  });
}

// src/ledger/index.ts
import { createHash, randomBytes as randomBytes2 } from "node:crypto";
import { closeSync as closeSync3, existsSync as existsSync3, fstatSync as fstatSync3, openSync as openSync3, readFileSync as readFileSync5, readSync as readSync2, renameSync, rmSync, statSync as statSync2 } from "node:fs";

// src/contract/mdl-fields.ts
var UNKNOWN_VALUE = "unknown";
var MDL_FIELDS = [
  { key: "why", kind: "closed-single", values: WHYS },
  { key: "area", kind: "closed-list", values: AREAS, maxList: 2, note: "omit for whole-system questions: uses carries the map" },
  { key: "stage", kind: "closed-single", values: STAGES, note: "operate = live production/incident" },
  { key: "change", kind: "closed-single", values: CHANGES, note: "only when a code change is involved" },
  { key: "risk", kind: "closed-single", values: RISKS, note: "the stakes if this answer is wrong" },
  { key: "problem", kind: "freetext", note: "one line \u2264160: what you're solving, in your own words" },
  { key: "uses", kind: "chain-list", maxList: 5, note: "list \u22645 of chains (grammar below)" },
  { key: "blast", kind: "closed-single", values: BLASTS, note: "the widest level one failure reaches (person = users' data or accounts)" },
  { key: "touches", kind: "freetext-list", maxList: 5, note: 'list \u22645 domain objects/fields (not concepts like "authentication", not language built-ins)' }
];
var MDL_PARENT_KEY = "parent";
var MDL_KEYS = [...MDL_FIELDS.map((f) => f.key), MDL_PARENT_KEY];
function effectiveMdlFields(overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return MDL_FIELDS;
  return MDL_FIELDS.map((f) => {
    const o = overrides[f.key];
    if (!o) return f;
    return {
      ...f,
      ...o.values !== void 0 ? { values: o.values } : {},
      ...o.note !== void 0 ? { note: o.note } : {},
      ...o.as !== void 0 ? { alias: o.as } : {},
      ...o.pattern !== void 0 ? { pattern: o.pattern } : {},
      ...o.link !== void 0 ? { link: o.link } : {},
      ...o.literal !== void 0 ? { literal: o.literal } : {}
    };
  });
}
var CHAIN_LEVELS = ["person", "system", "container", "component", "code"];
var NAME = "[A-Za-z0-9._-]+";
var PART = `(?:${CHAIN_LEVELS.join("|")}):${NAME}(?:/${NAME})*\\??`;
var CHAIN_RE = new RegExp(`^${PART}(?: -> ${PART})*$`, "u");
var MAX_MDL_LINES = 25;
var MAX_CUSTOM_KEY_LEN = 20;
var MAX_FREETEXT_LEN = 160;
var MAX_TOUCH_LEN = 40;
var CUSTOM_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;
var isCustomKey = (k) => CUSTOM_KEY_RE.test(k) && k.length <= MAX_CUSTOM_KEY_LEN;
function closedValues(field) {
  return [...field.values ?? [], UNKNOWN_VALUE];
}
function normalizeMdl(mdl2) {
  if (mdl2.uses !== void 0 || mdl2.nodes === void 0) return mdl2;
  const { nodes, ...rest } = mdl2;
  return { ...rest, uses: [nodes] };
}

// src/ledger/log.ts
import { accessSync, appendFileSync, closeSync as closeSync2, constants, fstatSync as fstatSync2, openSync as openSync2, readFileSync as readFileSync4, readSync } from "node:fs";
import path3 from "node:path";

// src/ledger/ids.ts
import { randomBytes } from "node:crypto";
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var RUN_ID = /^(?:MM3|SW)-(\d{4,})$/;
function ulid(now = Date.now(), random = (n) => randomBytes(n)) {
  let t = now;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const bytes = random(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  return time + rand;
}
function formatRunId(n) {
  return `MM3-${String(n).padStart(4, "0")}`;
}

// src/ledger/log.ts
var KNOWN_KINDS = ["run", "outcome", "failed", "lookup", "config"];
function notARecord(value, lineNo, shown2) {
  const kind = value && typeof value === "object" && !Array.isArray(value) ? value.kind : void 0;
  if (typeof kind === "string" && !KNOWN_KINDS.includes(kind)) {
    return new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} has a ${JSON.stringify(kind.slice(0, 30))} record this MM3 does not know \u2192 update this copy of MM3 (mm3 doctor shows which)`);
  }
  return new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not a ledger record \u2192 fix or remove that line`);
}
var LedgerError = class extends Error {
  /** 1: the ledger itself is the problem · 2: the caller asked for something the ledger doesn't hold. */
  exit;
  constructor(message, exit = 1) {
    super(message);
    this.name = "LedgerError";
    this.exit = exit;
  }
};
var isRun = (r) => r.kind === "run" && !("v" in r);
var isContractRun = (r) => r.kind === "run" && r.v === 2;
var iso = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
var isText = (v) => typeof v === "string";
var isObj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function isRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v;
  if (r.kind === "outcome") return [r.id, r.of, r.outcome, r.by, r.ts].every(isText);
  if (r.kind === "failed") return [r.id, r.ts, r.verb, r.actor, r.adapter, r.model, r.reason].every(isText);
  if (r.kind === "config") return [r.id, r.uid, r.ts, r.fingerprint].every(isText) && isObj2(r.settings) && Array.isArray(r.changes) && r.changes.every(isText) && (r.windowSince === void 0 || isText(r.windowSince)) && (r.absent === void 0 || r.absent === true);
  if (r.kind === "lookup") return [r.id, r.uid, r.ts, r.goal].every(isText) && Array.isArray(r.where) && r.where.every(isText) && typeof r.hit === "boolean";
  if (r.kind !== "run") return false;
  if (r.v === 2) {
    return [r.id, r.uid, r.ts, r.verb, r.goal, r.gate, r.adapter, r.model, r.actor, r.response].every(isText) && Array.isArray(r.where) && r.where.every(isText) && isObj2(r.answers) && isObj2(r.keys) && isObj2(r.categories);
  }
  return [r.id, r.ts, r.verb, r.focus, r.consensus, r.verdict, r.adapter].every(isText) && typeof r.level === "number" && Array.isArray(r.tags) && r.tags.every(isText) && Array.isArray(r.where) && r.where.every((w) => !!w && typeof w === "object" && isText(w.path));
}
var shownLog = (paths) => path3.relative(paths.root, paths.log).split(path3.sep).join("/");
function readLedger(paths, opts = {}) {
  const text = onStore(paths.log, "read", () => {
    try {
      return readFileSync4(paths.log, "utf8");
    } catch (e) {
      if (isAbsent(e)) return "";
      throw e;
    }
  });
  const shown2 = shownLog(paths);
  const records = [];
  const lines = text.split("\n");
  lines.forEach((line3, i) => {
    if (!line3.trim()) return;
    const inProgress = opts.partialTail === true && i === lines.length - 1;
    let value;
    try {
      value = JSON.parse(line3);
    } catch {
      if (inProgress) return;
      throw new LedgerError(`\u2716 ledger: line ${i + 1} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
    }
    if (!isRecord(value)) {
      if (inProgress) return;
      throw notARecord(value, i + 1, shown2);
    }
    records.push(normalizeRecordMdl(value));
  });
  return records;
}
function checkTail(paths, upto, lineCount) {
  let fd;
  try {
    fd = openSync2(paths.log, "r");
  } catch (e) {
    if (isAbsent(e)) return;
    throw e;
  }
  let raw;
  try {
    const size = fstatSync2(fd).size;
    if (size <= upto) return;
    const buf = Buffer.alloc(size - upto);
    let got = 0;
    while (got < buf.length) {
      const n = readSync(fd, buf, got, buf.length - got, upto + got);
      if (n <= 0) break;
      got += n;
    }
    raw = buf.subarray(0, got).toString("utf8");
  } finally {
    closeSync2(fd);
  }
  if (!raw.trim()) return;
  const shown2 = shownLog(paths);
  const lineNo = lineCount + 1;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
  }
  if (!isRecord(value)) throw notARecord(value, lineNo, shown2);
}
function checkLedger(paths) {
  withLock(paths.lock, () => {
    onStore(paths.log, "read", () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    onStore(paths.log, "write", () => {
      try {
        accessSync(paths.log, constants.W_OK);
      } catch (e) {
        if (!isAbsent(e)) throw e;
      }
    });
  });
}
function logEndsCleanly(logPath) {
  let fd;
  try {
    fd = openSync2(logPath, "r");
  } catch (e) {
    if (isAbsent(e)) return true;
    throw e;
  }
  try {
    const size = fstatSync2(fd).size;
    if (size === 0) return true;
    const buf = Buffer.alloc(1);
    const got = readSync(fd, buf, 0, 1, size - 1);
    return got === 1 && buf[0] === 10;
  } finally {
    closeSync2(fd);
  }
}
function appendLine(paths, record2) {
  onStore(paths.log, "write", () => {
    ensureDir(paths);
    const needsBreak = !logEndsCleanly(paths.log);
    appendFileSync(paths.log, `${needsBreak ? "\n" : ""}${JSON.stringify(record2)}
`);
  });
}
function nextRunNumber(paths) {
  return withIndex(paths, (h) => h.runCount()) + 1;
}
function matchingRun(at, logPath, id) {
  const record2 = readRecordAt(logPath, at);
  return record2 && record2.kind === "run" && record2.id === id ? record2 : void 0;
}
function findRun(paths, id) {
  const at = withIndex(paths, (h) => h.findOffset(id), { readOnly: true });
  if (at === void 0) return void 0;
  const first = matchingRun(at, paths.log, id);
  if (first) return first;
  const at2 = withIndex(paths, (h) => h.findOffset(id), { forceRebuild: true, readOnly: true });
  return at2 === void 0 ? void 0 : matchingRun(at2, paths.log, id);
}
function appendRunLocked(paths, run, now = Date.now()) {
  const record2 = { kind: "run", id: formatRunId(nextRunNumber(paths)), uid: ulid(now), ts: iso(now), ...redactDeep(run), actor: redactSecrets(run.actor) };
  appendLine(paths, record2);
  return record2;
}
function appendContractRunLocked(paths, run, now, budget) {
  const id = formatRunId(nextRunNumber(paths));
  const { response, ...rest } = run;
  const record2 = {
    kind: "run",
    v: 2,
    id,
    uid: ulid(now),
    ts: iso(now),
    ...redactDeep(rest),
    actor: redactSecrets(run.actor),
    response: redact(response(id, budget))
  };
  appendLine(paths, record2);
  return record2;
}
function appendContractRun(paths, run, now, budget) {
  return withLock(paths.lock, () => appendContractRunLocked(paths, run, now, budget));
}
function appendFailedLocked(paths, failed2, now = Date.now()) {
  onStore(paths.log, "read", () => {
    const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
    checkTail(paths, at.upto, at.lineCount);
  });
  const uid = ulid(now);
  const record2 = { kind: "failed", id: uid, uid, ts: iso(now), ...redactDeep(failed2), actor: redactSecrets(failed2.actor) };
  appendLine(paths, record2);
  return record2;
}
function appendConfig(paths, config, now = Date.now()) {
  return withLock(paths.lock, () => {
    const uid = ulid(now);
    const record2 = { kind: "config", id: uid, uid, ts: iso(now), ...redactDeep(config) };
    appendLine(paths, record2);
    return record2;
  });
}
function appendLookup(paths, lookup, now = Date.now()) {
  return withLock(paths.lock, () => {
    const uid = ulid(now);
    const record2 = { kind: "lookup", id: uid, uid, ts: iso(now), ...redactDeep(lookup) };
    appendLine(paths, record2);
    return record2;
  });
}
function appendOutcome(paths, of, outcome, by, now = Date.now()) {
  return withLock(paths.lock, () => {
    const run = findRun(paths, of);
    if (!run) throw new LedgerError(`\u2716 outcome: ${of} is not in the ledger \u2192 check the id with "mm3 view ${of}"
\u2192 see: mm3 agent outcome`, 2);
    const who = redactSecrets(by);
    if (outcome === "held" && who === run.actor) {
      throw new LedgerError(`\u2716 outcome: ${who} asked ${of}, so it can't mark it held \u2192 another agent or the owner records "held"
\u2192 see: mm3 agent outcome`);
    }
    onStore(paths.log, "read", () => {
      const at = withIndex(paths, (h) => ({ upto: h.upto(), lineCount: h.lineCount() }));
      checkTail(paths, at.upto, at.lineCount);
    });
    const latest = withIndex(paths, (h) => h.latestOutcomeOf(of));
    if (latest && latest.outcome === outcome && latest.by === who) {
      return { record: { kind: "outcome", id: `${of}-outcome`, uid: latest.uid, ts: latest.ts, of, outcome, by: who }, repeat: true };
    }
    const record2 = { kind: "outcome", id: `${of}-outcome`, uid: ulid(now), ts: iso(now), of, outcome, by: who };
    appendLine(paths, record2);
    return { record: record2, repeat: false };
  });
}
function latestOutcome(records, id) {
  let found = null;
  for (const r of records) if (r.kind === "outcome" && r.of === id) found = r.outcome;
  return found;
}

// src/util/node-version.ts
var MIN_NODE_MAJOR = 22;
var MIN_NODE_MINOR = 13;
var MIN_NODE_LABEL = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;
function parseNodeVersion(v) {
  const m2 = /^v?(\d+)\.(\d+)/u.exec(v.trim());
  if (!m2) return void 0;
  return { major: Number(m2[1]), minor: Number(m2[2]) };
}
function nodeVersionOk(v) {
  const parsed = parseNodeVersion(v);
  if (!parsed) return false;
  if (parsed.major !== MIN_NODE_MAJOR) return parsed.major > MIN_NODE_MAJOR;
  return parsed.minor >= MIN_NODE_MINOR;
}
function nodeVersionStop(v) {
  if (nodeVersionOk(v)) return void 0;
  return `\u2716 node: ${v} is too old \u2192 install Node 22.13 or newer (it powers the ledger index); https://nodejs.org`;
}
function doctorNodeValue(v) {
  return nodeVersionOk(v) ? v : `${v} \u2716 too old \u2192 install Node ${MIN_NODE_LABEL}+`;
}
var DOCTOR_INDEX_TOO_OLD = `none (needs Node ${MIN_NODE_LABEL}+)`;

// src/ledger/index.ts
var whoKey = (who) => `${who.adapter}|${who.model}`;
var stripLines = (entry) => entry.replace(/:(\d+(?:-\d+)?)$/u, "");
function sweepPlaces(rec) {
  if (!rec.items) return [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (kind, val) => {
    const k = `${kind}\0${val}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, val });
  };
  for (const item of Object.values(rec.items)) if (item.unit) add("where", item.unit.path);
  for (const layer of rec.ask.layers) for (const cat of layer.categories) for (const tag of cat.tags) add("tag", tag);
  return out;
}
function categoryShape(c) {
  return {
    name: c.name,
    pass: c.pass,
    need: c.need,
    questions: [...c.questions].sort((a, b) => a.n - b.n).map((q) => ({ kind: q.kind, text: q.text, ...q.kind === "scale" ? { levels: q.levels } : {}, ...q.kind === "choice" ? { options: q.options } : {} }))
  };
}
function patternFingerprint(rec) {
  if (!isContractRun(rec)) return null;
  const { categories, layers } = rec.ask;
  if (!categories.length && !layers.length) return null;
  const shape = categories.length ? [...categories].sort((a, b) => a.name.localeCompare(b.name)).map(categoryShape) : [...layers].map((l) => ({ name: l.name, categories: [...l.categories].sort((a, b) => a.name.localeCompare(b.name)).map(categoryShape) }));
  return sha256hex(JSON.stringify(shape)).slice(0, 16);
}
var CHUNK_BYTES = 1 << 20;
function countsTowardBudget(rec) {
  return !isContractRun(rec) || rec.calls > 0;
}
function normalizeRecordMdl(value) {
  const legacy = value;
  for (const [oldKey, newKey] of [["wise", "mdl"], ["side", "mak"]]) {
    if (oldKey in legacy && !(newKey in legacy)) legacy[newKey] = legacy[oldKey];
    delete legacy[oldKey];
  }
  const w = value.mdl;
  if (w && typeof w === "object" && !Array.isArray(w)) {
    value.mdl = normalizeMdl(w);
  }
  return value;
}
function parseLedgerLine(raw, lineNo, shown2) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LedgerError(`\u2716 ledger: line ${lineNo} of ${shown2} is not valid JSON \u2192 fix or remove that line`);
  }
  if (!isRecord(value)) {
    throw notARecord(value, lineNo, shown2);
  }
  return normalizeRecordMdl(value);
}
function applyLine(sink, raw, startByte, lineNo, shown2) {
  const value = parseLedgerLine(raw, lineNo, shown2);
  if (value.kind === "outcome") {
    sink.outcome(value);
    return false;
  }
  if (value.kind === "failed") {
    sink.failed(value);
    return false;
  }
  if (value.kind === "config") {
    sink.config(startByte);
    return false;
  }
  if (value.kind !== "run") return false;
  sink.run(value, startByte);
  return true;
}
function scanRange(fd, from, to, sink, shown2, startUpto, startLineCount) {
  let at = startUpto;
  let line3 = startLineCount;
  let runsSeen = 0;
  let lastLineStart = startUpto;
  let lastLineRaw = "";
  let pos = from;
  let carry = Buffer.alloc(0);
  const buf = Buffer.alloc(Math.min(CHUNK_BYTES, Math.max(1, to - from)));
  while (pos < to) {
    const want = Math.min(buf.length, to - pos);
    const got = readSync2(fd, buf, 0, want, pos);
    if (got <= 0) break;
    pos += got;
    const chunk2 = carry.length ? Buffer.concat([carry, buf.subarray(0, got)]) : Buffer.from(buf.subarray(0, got));
    let lineStart = 0;
    for (let i = 0; i < chunk2.length; i++) {
      if (chunk2[i] !== 10) continue;
      const raw = chunk2.toString("utf8", lineStart, i);
      const startByte = at;
      at += i - lineStart + 1;
      line3 += 1;
      lastLineStart = startByte;
      lastLineRaw = raw;
      if (raw.trim() && applyLine(sink, raw, startByte, line3, shown2)) runsSeen += 1;
      lineStart = i + 1;
    }
    carry = Buffer.from(chunk2.subarray(lineStart));
  }
  return { upto: at, lineCount: line3, runsSeen, lastLineStart, lastLineRaw };
}
var sha256hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");
function hashLogRange(logPath, from, to) {
  if (to <= from) return sha256hex("");
  const fd = openSync3(logPath, "r");
  try {
    const buf = Buffer.alloc(to - from);
    let got = 0;
    while (got < buf.length) {
      const n = readSync2(fd, buf, got, buf.length - got, from + got);
      if (n <= 0) break;
      got += n;
    }
    return sha256hex(buf.subarray(0, got).toString("utf8"));
  } finally {
    closeSync3(fd);
  }
}
function openLog(logPath) {
  let fd;
  try {
    fd = openSync3(logPath, "r");
  } catch (e) {
    if (isAbsent(e)) return void 0;
    throw e;
  }
  try {
    return { fd, st: fstatSync3(fd) };
  } catch (e) {
    closeSync3(fd);
    throw e;
  }
}
function readRecordAt(logPath, offset) {
  if (offset < 0) return void 0;
  let fd;
  try {
    fd = openSync3(logPath, "r");
  } catch {
    return void 0;
  }
  try {
    const size = fstatSync3(fd).size;
    if (offset >= size) return void 0;
    let chunkSize = Math.min(4096, size - offset);
    for (; ; ) {
      const buf = Buffer.alloc(chunkSize);
      const got = readSync2(fd, buf, 0, chunkSize, offset);
      if (got <= 0) return void 0;
      const nl = buf.subarray(0, got).indexOf(10);
      const complete = nl !== -1 ? buf.toString("utf8", 0, nl) : offset + got >= size ? buf.toString("utf8", 0, got) : null;
      if (complete !== null) {
        try {
          return normalizeRecordMdl(JSON.parse(complete));
        } catch {
          return void 0;
        }
      }
      chunkSize = Math.min(chunkSize * 2, size - offset);
    }
  } catch {
    return void 0;
  } finally {
    closeSync3(fd);
  }
}
function emptyMemoryState() {
  return { runOffset: /* @__PURE__ */ new Map(), blocked: /* @__PURE__ */ new Set(), reuseKey: /* @__PURE__ */ new Map(), candidatesByWho: /* @__PURE__ */ new Map(), places: [], categories: [], childrenByParent: /* @__PURE__ */ new Map(), outcomes: /* @__PURE__ */ new Map(), allRuns: [], spend: /* @__PURE__ */ new Map(), runCount: 0, upto: 0, lineCount: 0, configOffset: void 0 };
}
function memorySink(state) {
  return {
    run(rec, offset) {
      state.runCount += 1;
      if (countsTowardBudget(rec)) state.spend.set(rec.id, { ts: rec.ts, cost: rec.costUsd ?? 0 });
      state.runOffset.set(rec.id, offset);
      state.allRuns.push({ id: rec.id, offset, verb: rec.verb, gate: isContractRun(rec) ? rec.gate : null, pattern: patternFingerprint(rec) });
      const parent = rec.parent ?? null;
      if (parent) {
        if (!state.childrenByParent.has(parent)) state.childrenByParent.set(parent, []);
        state.childrenByParent.get(parent).push({ id: rec.id, offset });
      }
      if (isContractRun(rec)) {
        const wk = whoKey({ adapter: rec.adapter, model: rec.model });
        if (!state.candidatesByWho.has(wk)) state.candidatesByWho.set(wk, []);
        state.candidatesByWho.get(wk).unshift({ id: rec.id, offset });
        if (!state.reuseKey.has(wk)) state.reuseKey.set(wk, /* @__PURE__ */ new Map());
        const table = state.reuseKey.get(wk);
        for (const [qid, key2] of Object.entries(rec.keys)) table.set(key2, { runId: rec.reusedFrom[qid] ?? rec.id, qid });
        for (const w of rec.where) state.places.push({ kind: "where", val: stripLines(w), runId: rec.id });
        for (const p of sweepPlaces(rec)) state.places.push({ ...p, runId: rec.id });
        for (const c of runCategories(rec)) state.categories.push({ runId: rec.id, name: c.name, section: c.section, family: c.family ?? null, gate: rec.categories[c.name] ?? null });
      } else {
        for (const w of rec.where) state.places.push({ kind: "where", val: w.path, runId: rec.id });
        for (const t of rec.tags) state.places.push({ kind: "tag", val: t, runId: rec.id });
      }
    },
    outcome(rec) {
      if (rec.outcome === "held") state.blocked.delete(rec.of);
      else state.blocked.add(rec.of);
      state.outcomes.set(rec.of, { outcome: rec.outcome, uid: rec.uid, ts: rec.ts, by: rec.by });
    },
    failed(rec) {
      state.spend.set(rec.id, { ts: rec.ts, cost: rec.costUsd ?? 0 });
    },
    config(offset) {
      state.configOffset = offset;
    }
  };
}
function handleFromMemory(state) {
  return {
    findOffset: (id) => state.runOffset.get(id),
    runCount: () => state.runCount,
    upto: () => state.upto,
    lineCount: () => state.lineCount,
    isBlocked: (id) => state.blocked.has(id),
    reuseKeyHit: (adapter, model, key2) => {
      const hit = state.reuseKey.get(whoKey({ adapter, model }))?.get(key2);
      if (!hit) return void 0;
      const offset = state.runOffset.get(hit.runId);
      return offset === void 0 ? void 0 : { ...hit, offset, blocked: state.blocked.has(hit.runId) };
    },
    candidates: (adapter, model) => (state.candidatesByWho.get(whoKey({ adapter, model })) ?? []).filter((c) => !state.blocked.has(c.id)),
    placeCandidates: (place) => {
      const prefix = `${place}/`;
      const ids = /* @__PURE__ */ new Set();
      for (const p of state.places) {
        const hit = p.kind === "tag" ? p.val === place : p.val === place || p.val.startsWith(prefix);
        if (hit) ids.add(p.runId);
      }
      return [...ids].map((id) => ({ id, offset: state.runOffset.get(id) })).filter((c) => c.offset !== void 0).sort((a, b) => a.offset - b.offset);
    },
    childrenOf: (parentId) => state.childrenByParent.get(parentId) ?? [],
    outcomesFor: (ids) => {
      const want = new Set(ids);
      const out = /* @__PURE__ */ new Map();
      for (const [id, rec] of state.outcomes) if (want.has(id)) out.set(id, rec.outcome);
      return out;
    },
    everHeld: (adapter, model, key2) => state.reuseKey.get(whoKey({ adapter, model }))?.has(key2) ?? false,
    latestOutcomeOf: (id) => state.outcomes.get(id),
    distinctPlaces: () => {
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const p of state.places) {
        const k = `${p.kind}\0${p.val}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ kind: p.kind, val: p.val });
      }
      return out;
    },
    patternCounts: () => {
      const patternOfRun = /* @__PURE__ */ new Map();
      const byPattern = /* @__PURE__ */ new Map();
      for (const r of state.allRuns) {
        if (!r.pattern) continue;
        patternOfRun.set(r.id, r.pattern);
        const cur = byPattern.get(r.pattern) ?? { runs: 0, pass: 0, fail: 0, unsure: 0 };
        cur.runs += 1;
        if (r.gate === "pass") cur.pass += 1;
        else if (r.gate === "fail") cur.fail += 1;
        else if (r.gate === "unsure") cur.unsure += 1;
        byPattern.set(r.pattern, cur);
      }
      const placesByPattern = /* @__PURE__ */ new Map();
      for (const p of state.places) {
        const pat = patternOfRun.get(p.runId);
        if (!pat) continue;
        if (!placesByPattern.has(pat)) placesByPattern.set(pat, /* @__PURE__ */ new Set());
        placesByPattern.get(pat).add(`${p.kind}\0${p.val}`);
      }
      const outcomesByPattern = /* @__PURE__ */ new Map();
      for (const [runId, rec] of state.outcomes) {
        const pat = patternOfRun.get(runId);
        if (!pat) continue;
        const cur = outcomesByPattern.get(pat) ?? { held: 0, overruled: 0, failed: 0 };
        cur[rec.outcome] += 1;
        outcomesByPattern.set(pat, cur);
      }
      return [...byPattern.entries()].map(([pattern, c]) => {
        const oc = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
        return { pattern, ...c, places: placesByPattern.get(pattern)?.size ?? 0, outcomes: { ...oc, open: c.runs - oc.held - oc.overruled - oc.failed } };
      }).sort((a, b) => b.runs - a.runs || a.pattern.localeCompare(b.pattern));
    },
    familyCounts: () => {
      const byFamily = /* @__PURE__ */ new Map();
      for (const c of state.categories) {
        if (!c.family) continue;
        const cur = byFamily.get(c.family) ?? { categories: 0, pass: 0, fail: 0, unsure: 0, runs: /* @__PURE__ */ new Set() };
        cur.categories += 1;
        cur.runs.add(c.runId);
        if (c.gate === "pass") cur.pass += 1;
        else if (c.gate === "fail") cur.fail += 1;
        else if (c.gate === "unsure") cur.unsure += 1;
        byFamily.set(c.family, cur);
      }
      return [...byFamily.entries()].map(([family, v]) => ({ family, categories: v.categories, runs: v.runs.size, pass: v.pass, fail: v.fail, unsure: v.unsure })).sort((a, b) => b.categories - a.categories || a.family.localeCompare(b.family));
    },
    recentReplays: (limit) => state.allRuns.filter((r) => r.verb === "replay").slice(-limit).reverse().map((r) => ({ id: r.id, offset: r.offset })),
    recentOutcomes: (limit) => [...state.outcomes.entries()].slice(-limit).reverse().map(([runId, r]) => ({ runId, outcome: r.outcome, ts: r.ts, by: r.by })),
    budgetRollup: (sinceIso) => {
      let spentUsd = 0;
      let runs = 0;
      for (const s of state.spend.values()) {
        if (s.ts < sinceIso) continue;
        spentUsd += s.cost;
        runs += 1;
      }
      return { spentUsd, runs };
    },
    latestConfigOffset: () => state.configOffset
  };
}
var memoryCache;
function buildMemoryHandle(paths) {
  const log = openLog(paths.log);
  try {
    const size = log?.st.size ?? 0;
    const mtimeMs = log ? Math.round(log.st.mtimeMs) : 0;
    if (memoryCache && memoryCache.logPath === paths.log && memoryCache.size === size && memoryCache.mtimeMs === mtimeMs) {
      return handleFromMemory(memoryCache.state);
    }
    const state = emptyMemoryState();
    if (log && size > 0) {
      const result = scanRange(log.fd, 0, size, memorySink(state), shownLog(paths), 0, 0);
      state.upto = result.upto;
      state.lineCount = result.lineCount;
    }
    memoryCache = { logPath: paths.log, size, mtimeMs, state };
    return handleFromMemory(state);
  } finally {
    if (log) closeSync3(log.fd);
  }
}
var SCHEMA_VERSION = 8;
var SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  offset INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  verb TEXT NOT NULL,
  ts TEXT NOT NULL,
  gate TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  mdl TEXT,
  parent TEXT,
  pattern TEXT
);
CREATE INDEX idx_runs_adapter_model ON runs(adapter, model, blocked);
CREATE INDEX idx_runs_parent ON runs(parent);
CREATE INDEX idx_runs_verb ON runs(verb);
CREATE INDEX idx_runs_pattern ON runs(pattern);
CREATE TABLE answer_keys (
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  key TEXT NOT NULL,
  run_id TEXT NOT NULL,
  qid TEXT NOT NULL,
  PRIMARY KEY (adapter, model, key)
);
CREATE TABLE outcomes (
  run_id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,
  uid TEXT NOT NULL,
  ts TEXT NOT NULL,
  by TEXT NOT NULL
);
CREATE TABLE places (
  kind TEXT NOT NULL,
  val TEXT NOT NULL,
  run_id TEXT NOT NULL,
  PRIMARY KEY (kind, val, run_id)
);
CREATE INDEX idx_places_val ON places(kind, val);
CREATE TABLE categories (
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  section TEXT NOT NULL,
  family TEXT,
  gate TEXT,
  PRIMARY KEY (run_id, name)
);
CREATE INDEX idx_categories_family ON categories(family);
CREATE TABLE spend (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  cost REAL NOT NULL
);
CREATE INDEX idx_spend_ts ON spend(ts);
`;
function runCategories(rec) {
  if (!isContractRun(rec)) return [];
  return rec.ask.categories.length ? rec.ask.categories : rec.ask.layers.flatMap((l) => l.categories);
}
var __testOnly = { forceFallback: false, throwOnCandidates: false, forceSqliteMissing: false };
function isSqliteExperimentalWarning(w) {
  return w.name === "ExperimentalWarning" && /sqlite/iu.test(w.message ?? "");
}
var warningFilterInstalled = false;
function installSqliteWarningFilter() {
  if (warningFilterInstalled) return;
  warningFilterInstalled = true;
  const originalEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning, ...rest) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type ?? "";
    if (isSqliteExperimentalWarning({ name: type, message })) return;
    return originalEmitWarning(warning, ...rest);
  });
}
var sqliteCtor;
function getSqliteCtor() {
  if (__testOnly.forceSqliteMissing) return null;
  if (sqliteCtor !== void 0) return sqliteCtor;
  const getBuiltin = process.getBuiltinModule;
  if (typeof getBuiltin !== "function") {
    sqliteCtor = null;
    return null;
  }
  installSqliteWarningFilter();
  try {
    const mod = getBuiltin("node:sqlite");
    sqliteCtor = typeof mod?.DatabaseSync === "function" ? mod.DatabaseSync : null;
  } catch {
    sqliteCtor = null;
  }
  return sqliteCtor;
}
function sqliteAvailable() {
  return getSqliteCtor() !== null;
}
function getMeta(db, key2) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key2);
  return row ? String(row.value) : void 0;
}
function setMeta(db, key2, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key2, value);
}
function prepStatements(db) {
  return {
    insertRun: db.prepare("INSERT OR REPLACE INTO runs (id, offset, adapter, model, verb, ts, gate, blocked, mdl, parent, pattern) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)"),
    insertKey: db.prepare("INSERT OR REPLACE INTO answer_keys (adapter, model, key, run_id, qid) VALUES (?, ?, ?, ?, ?)"),
    insertOutcome: db.prepare("INSERT OR REPLACE INTO outcomes (run_id, outcome, uid, ts, by) VALUES (?, ?, ?, ?, ?)"),
    insertPlace: db.prepare("INSERT OR IGNORE INTO places (kind, val, run_id) VALUES (?, ?, ?)"),
    insertCategory: db.prepare("INSERT OR REPLACE INTO categories (run_id, name, section, family, gate) VALUES (?, ?, ?, ?, ?)"),
    updateBlocked: db.prepare("UPDATE runs SET blocked = ? WHERE id = ?"),
    insertSpend: db.prepare("INSERT OR REPLACE INTO spend (id, ts, cost) VALUES (?, ?, ?)"),
    setLastConfig: db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_config_offset', ?)")
  };
}
function mdlJson(rec) {
  if (!isContractRun(rec)) return null;
  const categories = Object.keys(rec.categories ?? {});
  if (rec.mdl === null && categories.length === 0) return null;
  return JSON.stringify({ mdl: rec.mdl, categories });
}
function sqlSink(stmts) {
  return {
    run(rec, offset) {
      const gate = "gate" in rec ? rec.gate ?? null : null;
      stmts.insertRun.run(rec.id, offset, rec.adapter, rec.model, rec.verb, rec.ts, gate, mdlJson(rec), rec.parent ?? null, patternFingerprint(rec));
      if (countsTowardBudget(rec)) stmts.insertSpend.run(rec.id, rec.ts, rec.costUsd ?? 0);
      if (isContractRun(rec)) {
        for (const [qid, key2] of Object.entries(rec.keys)) stmts.insertKey.run(rec.adapter, rec.model, key2, rec.reusedFrom[qid] ?? rec.id, qid);
        for (const w of rec.where) stmts.insertPlace.run("where", stripLines(w), rec.id);
        for (const p of sweepPlaces(rec)) stmts.insertPlace.run(p.kind, p.val, rec.id);
        for (const c of runCategories(rec)) stmts.insertCategory.run(rec.id, c.name, c.section, c.family ?? null, rec.categories[c.name] ?? null);
      } else {
        for (const w of rec.where) stmts.insertPlace.run("where", w.path, rec.id);
        for (const t of rec.tags) stmts.insertPlace.run("tag", t, rec.id);
      }
    },
    outcome(rec) {
      stmts.insertOutcome.run(rec.of, rec.outcome, rec.uid, rec.ts, rec.by);
      stmts.updateBlocked.run(rec.outcome === "held" ? 0 : 1, rec.of);
    },
    failed(rec) {
      stmts.insertSpend.run(rec.id, rec.ts, rec.costUsd ?? 0);
    },
    config(offset) {
      stmts.setLastConfig.run(String(offset));
    }
  };
}
function readMetaState(db) {
  return { upto: Number(getMeta(db, "upto") ?? "0"), lineCount: Number(getMeta(db, "line_count") ?? "0"), runCount: Number(getMeta(db, "run_count") ?? "0") };
}
function fingerprintNow(logPath, from, to) {
  return hashLogRange(logPath, from, to);
}
function writeMetaStateFull(db, logPath, result) {
  setMeta(db, "upto", String(result.upto));
  setMeta(db, "line_count", String(result.lineCount));
  setMeta(db, "run_count", String(result.runsSeen));
  setMeta(db, "fp_start", String(result.lastLineStart));
  setMeta(db, "fingerprint", fingerprintNow(logPath, result.lastLineStart, result.upto));
}
function writeMetaStateCatchUp(db, logPath, before, result) {
  if (result.upto === before.upto) return;
  setMeta(db, "upto", String(result.upto));
  setMeta(db, "line_count", String(result.lineCount));
  setMeta(db, "run_count", String(before.runCount + result.runsSeen));
  setMeta(db, "fp_start", String(result.lastLineStart));
  setMeta(db, "fingerprint", fingerprintNow(logPath, result.lastLineStart, result.upto));
}
function escapeLike(s) {
  return s.replace(/[\\%_]/gu, (c) => `\\${c}`);
}
function handleFromSql(db) {
  const stFindOffset = db.prepare("SELECT offset FROM runs WHERE id = ?");
  const stIsBlocked = db.prepare("SELECT blocked FROM runs WHERE id = ?");
  const stReuseHit = db.prepare(
    "SELECT ak.run_id AS runId, ak.qid AS qid, r.offset AS offset, r.blocked AS blocked FROM answer_keys ak JOIN runs r ON r.id = ak.run_id WHERE ak.adapter = ? AND ak.model = ? AND ak.key = ?"
  );
  const stCandidates = db.prepare("SELECT id, offset FROM runs WHERE adapter = ? AND model = ? AND blocked = 0 ORDER BY rowid DESC");
  const stPlaces = db.prepare(
    `SELECT DISTINCT r.id AS id, r.offset AS offset FROM places p JOIN runs r ON r.id = p.run_id WHERE (p.kind = 'where' AND (p.val = ? OR p.val LIKE ? ESCAPE '\\')) OR (p.kind = 'tag' AND p.val = ?) ORDER BY r.offset ASC`
  );
  const stEverHeld = db.prepare("SELECT 1 FROM answer_keys WHERE adapter = ? AND model = ? AND key = ?");
  const stLatestOutcome = db.prepare("SELECT outcome, uid, ts, by FROM outcomes WHERE run_id = ?");
  const stChildren = db.prepare("SELECT id, offset FROM runs WHERE parent = ? ORDER BY offset ASC");
  const stDistinctPlaces = db.prepare("SELECT DISTINCT kind, val FROM places");
  const stPatternBase = db.prepare(
    `SELECT pattern, COUNT(*) AS runs, SUM(CASE WHEN gate = 'pass' THEN 1 ELSE 0 END) AS pass, SUM(CASE WHEN gate = 'fail' THEN 1 ELSE 0 END) AS fail, SUM(CASE WHEN gate = 'unsure' THEN 1 ELSE 0 END) AS unsure FROM runs WHERE pattern IS NOT NULL GROUP BY pattern`
  );
  const stPatternPlaces = db.prepare(
    `SELECT r.pattern AS pattern, COUNT(DISTINCT p.kind || ':' || p.val) AS places FROM runs r JOIN places p ON p.run_id = r.id WHERE r.pattern IS NOT NULL GROUP BY r.pattern`
  );
  const stPatternOutcomes = db.prepare(
    `SELECT r.pattern AS pattern, o.outcome AS outcome, COUNT(*) AS n FROM runs r JOIN outcomes o ON o.run_id = r.id WHERE r.pattern IS NOT NULL GROUP BY r.pattern, o.outcome`
  );
  const stFamilyCounts = db.prepare(
    `SELECT family, COUNT(*) AS categories, COUNT(DISTINCT run_id) AS runs, SUM(CASE WHEN gate = 'pass' THEN 1 ELSE 0 END) AS pass, SUM(CASE WHEN gate = 'fail' THEN 1 ELSE 0 END) AS fail, SUM(CASE WHEN gate = 'unsure' THEN 1 ELSE 0 END) AS unsure FROM categories WHERE family IS NOT NULL GROUP BY family`
  );
  const stRecentReplays = db.prepare("SELECT id, offset FROM runs WHERE verb = ? ORDER BY rowid DESC LIMIT ?");
  const stRecentOutcomes = db.prepare("SELECT run_id AS runId, outcome, ts, by FROM outcomes ORDER BY rowid DESC LIMIT ?");
  const stBudgetRollup = db.prepare("SELECT COALESCE(SUM(cost), 0) AS spentUsd, COUNT(*) AS runs FROM spend WHERE ts >= ?");
  return {
    findOffset: (id) => {
      const row = stFindOffset.get(id);
      return row ? Number(row.offset) : void 0;
    },
    // A line count (run_count in meta), not SELECT COUNT(*) FROM runs — see applyLine's comment: `runs.id` is a
    // PK (INSERT OR REPLACE), which a real ledger's id-assignment invariant never collides, but nextRunNumber
    // must still count LINES the way readLedger's own linear scan always has, matching the fallback exactly.
    runCount: () => Number(getMeta(db, "run_count") ?? "0"),
    upto: () => Number(getMeta(db, "upto") ?? "0"),
    lineCount: () => Number(getMeta(db, "line_count") ?? "0"),
    isBlocked: (id) => {
      const row = stIsBlocked.get(id);
      return !!row && Number(row.blocked) !== 0;
    },
    reuseKeyHit: (adapter, model, key2) => {
      const row = stReuseHit.get(adapter, model, key2);
      return row ? { runId: String(row.runId), qid: String(row.qid), offset: Number(row.offset), blocked: Number(row.blocked) !== 0 } : void 0;
    },
    candidates: (adapter, model) => {
      if (__testOnly.throwOnCandidates) {
        __testOnly.throwOnCandidates = false;
        throw new Error("injected SQLite fault (test only)");
      }
      return stCandidates.all(adapter, model).map((r) => ({ id: String(r.id), offset: Number(r.offset) }));
    },
    placeCandidates: (place) => stPlaces.all(place, `${escapeLike(place)}/%`, place).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    childrenOf: (parentId) => stChildren.all(parentId).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    outcomesFor: (ids) => {
      const out = /* @__PURE__ */ new Map();
      if (!ids.length) return out;
      const stmt = db.prepare(`SELECT run_id AS runId, outcome FROM outcomes WHERE run_id IN (${ids.map(() => "?").join(",")})`);
      for (const row of stmt.all(...ids)) out.set(String(row.runId), row.outcome);
      return out;
    },
    everHeld: (adapter, model, key2) => !!stEverHeld.get(adapter, model, key2),
    latestOutcomeOf: (id) => {
      const row = stLatestOutcome.get(id);
      return row ? { outcome: row.outcome, uid: String(row.uid), ts: String(row.ts), by: String(row.by) } : void 0;
    },
    distinctPlaces: () => stDistinctPlaces.all().map((r) => ({ kind: r.kind, val: String(r.val) })),
    patternCounts: () => {
      const placesByPattern = new Map(stPatternPlaces.all().map((r) => [String(r.pattern), Number(r.places)]));
      const outcomesByPattern = /* @__PURE__ */ new Map();
      for (const r of stPatternOutcomes.all()) {
        const pattern = String(r.pattern);
        const cur = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
        const outcome = r.outcome;
        cur[outcome] += Number(r.n);
        outcomesByPattern.set(pattern, cur);
      }
      return stPatternBase.all().map((b) => {
        const pattern = String(b.pattern);
        const runs = Number(b.runs);
        const oc = outcomesByPattern.get(pattern) ?? { held: 0, overruled: 0, failed: 0 };
        return {
          pattern,
          runs,
          pass: Number(b.pass),
          fail: Number(b.fail),
          unsure: Number(b.unsure),
          places: placesByPattern.get(pattern) ?? 0,
          outcomes: { ...oc, open: runs - oc.held - oc.overruled - oc.failed }
        };
      }).sort((a, b) => b.runs - a.runs || a.pattern.localeCompare(b.pattern));
    },
    familyCounts: () => stFamilyCounts.all().map((r) => ({ family: String(r.family), categories: Number(r.categories), runs: Number(r.runs), pass: Number(r.pass), fail: Number(r.fail), unsure: Number(r.unsure) })).sort((a, b) => b.categories - a.categories || a.family.localeCompare(b.family)),
    recentReplays: (limit) => stRecentReplays.all("replay", limit).map((r) => ({ id: String(r.id), offset: Number(r.offset) })),
    recentOutcomes: (limit) => stRecentOutcomes.all(limit).map((r) => ({ runId: String(r.runId), outcome: r.outcome, ts: String(r.ts), by: String(r.by) })),
    budgetRollup: (sinceIso) => {
      const row = stBudgetRollup.get(sinceIso);
      return { spentUsd: Number(row.spentUsd), runs: Number(row.runs) };
    },
    latestConfigOffset: () => {
      const v = getMeta(db, "last_config_offset");
      return v === void 0 ? void 0 : Number(v);
    }
  };
}
function withLockIfNeeded(lockPath, fn) {
  let heldByUs = false;
  try {
    heldByUs = Number.parseInt(readFileSync5(lockPath, "utf8").trim(), 10) === process.pid;
  } catch {
  }
  return heldByUs ? fn() : withLock(lockPath, fn);
}
function tmpDbPath(dbPath) {
  return `${dbPath}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`;
}
function rmDbFiles(dbPath) {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync3(f)) rmSync(f, { force: true });
  }
}
function rmSiblingWalShm(dbPath) {
  for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync3(f)) rmSync(f, { force: true });
  }
}
function rebuildToDisk(paths, Db) {
  ensureDir(paths);
  const tmp = tmpDbPath(paths.index);
  rmDbFiles(tmp);
  const db = new Db(tmp);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA_SQL);
    const stmts = prepStatements(db);
    const log = openLog(paths.log);
    let result;
    try {
      db.exec("BEGIN");
      result = log && log.st.size > 0 ? scanRange(log.fd, 0, log.st.size, sqlSink(stmts), shownLog(paths), 0, 0) : { upto: 0, lineCount: 0, runsSeen: 0, lastLineStart: 0, lastLineRaw: "" };
    } finally {
      if (log) closeSync3(log.fd);
    }
    setMeta(db, "schema_version", String(SCHEMA_VERSION));
    writeMetaStateFull(db, paths.log, result);
    db.exec("COMMIT");
  } catch (e) {
    db.close();
    rmDbFiles(tmp);
    throw e;
  }
  db.close();
  if (existsSync3(paths.index)) {
    try {
      if (statSync2(paths.index).isDirectory()) rmSync(paths.index, { recursive: true, force: true });
    } catch {
    }
  }
  rmSiblingWalShm(paths.index);
  renameSync(tmp, paths.index);
  return new Db(paths.index);
}
function catchUpInPlace(db, paths) {
  const stmts = prepStatements(db);
  const before = readMetaState(db);
  const log = openLog(paths.log);
  if (!log) return;
  try {
    const size = log.st.size;
    if (size <= before.upto) return;
    db.exec("BEGIN");
    try {
      const result = scanRange(log.fd, before.upto, size, sqlSink(stmts), shownLog(paths), before.upto, before.lineCount);
      writeMetaStateCatchUp(db, paths.log, before, result);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    closeSync3(log.fd);
  }
}
function sizeLooksSane(db, dbPath) {
  try {
    const pageCount = Number(db.prepare("PRAGMA page_count").get()?.page_count ?? -1);
    const pageSize = Number(db.prepare("PRAGMA page_size").get()?.page_size ?? -1);
    if (!(pageCount >= 0) || !(pageSize > 0)) return false;
    return pageCount * pageSize === statSync2(dbPath).size;
  } catch {
    return false;
  }
}
function quickCheckOk(db) {
  try {
    const quick = db.prepare("PRAGMA quick_check").get();
    return !!quick && quick.quick_check === "ok";
  } catch {
    return false;
  }
}
function tryOpenAndCheck(paths, Db) {
  if (!existsSync3(paths.index)) return { ok: false };
  let db;
  try {
    db = new Db(paths.index);
  } catch {
    return { ok: false };
  }
  try {
    if (!sizeLooksSane(db, paths.index) && !quickCheckOk(db)) return { ok: false, db };
    if (getMeta(db, "schema_version") !== String(SCHEMA_VERSION)) return { ok: false, db };
    const { upto } = readMetaState(db);
    const size = existsSync3(paths.log) ? statSync2(paths.log).size : 0;
    if (size < upto) return { ok: false, db };
    const fpStart = Number(getMeta(db, "fp_start") ?? "0");
    const storedFp = getMeta(db, "fingerprint") ?? "";
    if (hashLogRange(paths.log, fpStart, upto) !== storedFp) return { ok: false, db };
    return { ok: true, db, fresh: size === upto };
  } catch {
    return { ok: false, db };
  }
}
function safeClose(db) {
  try {
    db.close();
  } catch {
  }
}
function refreshUnderLock(paths, Db) {
  const check = tryOpenAndCheck(paths, Db);
  if (check.ok) {
    if (!check.fresh) catchUpInPlace(check.db, paths);
    return check.db;
  }
  if (check.db) safeClose(check.db);
  return rebuildToDisk(paths, Db);
}
function ensureFreshDb(paths, Db, opts) {
  if (!opts.forceRebuild) {
    const check = tryOpenAndCheck(paths, Db);
    if (check.ok && check.fresh) return check.db;
    if (check.ok) {
      if (opts.readOnly) {
        safeClose(check.db);
        return void 0;
      }
      safeClose(check.db);
      return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
    }
    if (check.db) safeClose(check.db);
  }
  if (opts.readOnly) return void 0;
  return withLockIfNeeded(paths.lock, () => refreshUnderLock(paths, Db));
}
function withIndex(paths, fn, opts = {}) {
  const logStat = existsSync3(paths.log) ? statSync2(paths.log) : void 0;
  if (!logStat || logStat.size === 0) return fn(handleFromMemory(emptyMemoryState()));
  return runSqlite(paths, fn, { forceRebuild: opts.forceRebuild ?? false, readOnly: opts.readOnly ?? false });
}
function budgetRollup(paths, sinceIso, opts = {}) {
  return withIndex(paths, (handle) => handle.budgetRollup(sinceIso), { readOnly: opts.readOnly ?? false });
}
var NODE_TOO_OLD_LEDGER_MESSAGE = `\u2716 ledger: node:sqlite is unavailable \u2192 install Node ${MIN_NODE_LABEL} or newer (it powers the ledger index); https://nodejs.org`;
function runSqlite(paths, fn, opts) {
  if (__testOnly.forceFallback) return fn(buildMemoryHandle(paths));
  try {
    const Db = getSqliteCtor();
    if (!Db) throw new LedgerError(NODE_TOO_OLD_LEDGER_MESSAGE);
    const db = ensureFreshDb(paths, Db, opts);
    if (!db) return fn(buildMemoryHandle(paths));
    try {
      return fn(handleFromSql(db));
    } finally {
      safeClose(db);
    }
  } catch (e) {
    if (e instanceof LedgerError) throw e;
    return fn(buildMemoryHandle(paths));
  }
}
function latestConfigRecord(paths, opts = {}) {
  const offset = withIndex(paths, (h) => h.latestConfigOffset(), { readOnly: opts.readOnly ?? false });
  if (offset === void 0) return void 0;
  const rec = readRecordAt(paths.log, offset);
  return rec && rec.kind === "config" ? rec : void 0;
}

// src/budget/budget.ts
var BudgetError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetError";
  }
};
var iso2 = (now) => new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
var money = (n) => `$${n.toFixed(2)}`;
function moneyLeft(left, cap, spent) {
  if (spent <= 0) return money(left);
  for (let d = 2; d < 6; d++) if (left.toFixed(d) !== cap.toFixed(d)) return `$${left.toFixed(d)}`;
  return `$${left.toFixed(6)}`;
}
var EPOCH = iso2(0);
var AGENT_POINTER = "\n\u2192 see: mm3 agent budget";
function readLegacyBudgetJson(paths) {
  if (!existsSync4(paths.budget)) return void 0;
  try {
    const v = JSON.parse(readFileSync6(paths.budget, "utf8"));
    const capUsd = v.capUsd;
    const capRuns = v.capRuns;
    const resetAt = v.resetAt;
    if (typeof capUsd === "number" && Number.isFinite(capUsd) && typeof capRuns === "number" && Number.isFinite(capRuns) && typeof resetAt === "string") {
      return { capUsd, capRuns, resetAt };
    }
  } catch {
  }
  return void 0;
}
function windowStartMs(budget, now) {
  const sinceMs = budget.since ? Date.parse(budget.since) : 0;
  const floor = Number.isNaN(sinceMs) ? 0 : sinceMs;
  if (budget.per === "total") return floor;
  const d = new Date(now);
  const periodStartMs = budget.per === "day" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  return Math.max(floor, periodStartMs);
}
function stateFromConfig(paths, config, now, opts = {}) {
  let sinceMs = windowStartMs(config.budget, now);
  const restart = onStore(paths.log, "read", () => latestConfigRecord(paths, opts))?.windowSince;
  const restartMs = restart ? Date.parse(restart) : Number.NaN;
  const restarted = !Number.isNaN(restartMs) && restartMs > sinceMs;
  if (restarted) sinceMs = restartMs;
  const { spentUsd, runs } = onStore(paths.log, "read", () => budgetRollup(paths, iso2(sinceMs), opts));
  return { capUsd: config.budget.usd, capRuns: config.budget.runs, spentUsd, runs, resetAt: restarted ? iso2(sinceMs) : config.budget.since ?? EPOCH, warnAt: config.budget.warnAt };
}
function budgetStateNow(paths, now = Date.now(), env = process.env) {
  const { config } = resolveConfig(paths, env);
  return stateFromConfig(paths, config, now);
}
function peekBudget(paths, now = Date.now(), env = process.env) {
  try {
    const { config } = resolveConfig(paths, env);
    return stateFromConfig(paths, config, now, { readOnly: true });
  } catch {
    return void 0;
  }
}
function migrateLegacyIfNeeded(paths, env, resolved) {
  if (resolved.sources["budget.since"] === "config") return false;
  return withLock(paths.lock, () => {
    const legacy = readLegacyBudgetJson(paths);
    if (!legacy) return false;
    if (resolveConfig(paths, env).sources["budget.since"] === "config") return false;
    writeConfigOverride(paths, { budget: { usd: legacy.capUsd, runs: legacy.capRuns, per: "total", since: legacy.resetAt } });
    return true;
  });
}
function loadBudget(paths, now = Date.now(), env = process.env) {
  const resolved = resolveConfig(paths, env);
  const created = migrateLegacyIfNeeded(paths, env, resolved);
  return { state: stateFromConfig(paths, created ? resolveConfig(paths, env).config : resolved.config, now), created };
}
function usedFraction(s) {
  return Math.max(s.capUsd > 0 ? s.spentUsd / s.capUsd : 1, s.capRuns > 0 ? s.runs / s.capRuns : 1);
}
function raiseHint(usd, runs) {
  const keys = [usd ? "budget.usd" : "", runs ? "budget.runs" : ""].filter(Boolean).join(" and ");
  return `raise ${keys} in .mm3/config.yaml, then run mm3 config --load`;
}
function checkBudget2(s) {
  const runsCapped = s.runs >= s.capRuns;
  const usdCapped = s.spentUsd >= s.capUsd;
  if (runsCapped || usdCapped) {
    return { ok: false, message: `\u2716 budget: cap reached (${money(s.spentUsd)} of ${money(s.capUsd)} \xB7 ${s.runs} of ${s.capRuns} runs) \u2192 ask the owner to ${raiseHint(usdCapped, runsCapped)}${AGENT_POINTER}` };
  }
  return { ok: true };
}
var BUDGET_LOW_FRACTION = DEFAULT_CONFIG.budget.warnAt;
function budgetLine(s) {
  const usdLeft = Math.max(0, s.capUsd - s.spentUsd);
  const runsLeft = Math.max(0, s.capRuns - s.runs);
  const usdUsed = s.spentUsd > s.capUsd ? ` (${money(s.spentUsd)} used)` : "";
  const runsUsed = s.runs > s.capRuns ? ` (${s.runs} used)` : "";
  const line3 = `budget: ${moneyLeft(usdLeft, s.capUsd, s.spentUsd)} left of ${money(s.capUsd)}${usdUsed} \xB7 ${runsLeft} of ${s.capRuns} runs left${runsUsed}`;
  const warnAt = s.warnAt ?? BUDGET_LOW_FRACTION;
  if (usedFraction(s) < warnAt) return line3;
  const lowUsd = s.capUsd > 0 ? s.spentUsd / s.capUsd >= warnAt : true;
  const lowRuns = s.capRuns > 0 ? s.runs / s.capRuns >= warnAt : true;
  return `\u26A0 ${line3} \u2192 low: ask the owner to ${raiseHint(lowUsd, lowRuns)}`;
}

// src/classifier/chaos.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync7, renameSync as renameSync2, writeFileSync as writeFileSync3 } from "node:fs";
import path4 from "node:path";

// src/util/text.ts
var clip = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
var CONTROL = /[\u0000-\u001f\u007f]/;
var hasControlChars = (s) => CONTROL.test(s);

// src/util/prng.ts
function fnv1a(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed) {
  let a = fnv1a(seed) || 1;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/classifier/fake.ts
var FAKE_MODEL = "mm3-fake-1";
function pinned(state, id) {
  const table = state.__fake;
  return table && typeof table === "object" ? table[id] : void 0;
}
function answerNoul(question, state) {
  const override = pinned(state, question.id);
  const probability = typeof override === "number" ? override : seededRandom(`noul:${question.id}:${question.ask}`)();
  return { type: "noul", probability };
}
function answerScore(question, state) {
  const n = question.levels.length;
  const override = pinned(state, question.id);
  const idx = typeof override === "number" ? Math.min(n - 1, Math.max(0, Math.round(override))) : Math.floor(seededRandom(`score:${question.id}:${question.ask}`)() * n);
  const peak = typeof override === "number" ? 1 : 0.7;
  const distribution = Array.from({ length: n }, (_, i) => i === idx ? peak : (1 - peak) / Math.max(1, n - 1));
  const score = distribution.reduce((sum, p, i) => sum + p * i, 0);
  const confidence = (n * Math.max(...distribution) - 1) / (n - 1);
  return { type: "score", score, distribution, confidence };
}
function answerChoice(question, state) {
  const options = Object.keys(question.options);
  const override = pinned(state, question.id);
  const chosen = typeof override === "string" && options.includes(override) ? override : options[Math.floor(seededRandom(`choice:${question.id}:${question.ask}`)() * options.length)];
  const probabilities = {};
  for (const o of options) probabilities[o] = o === chosen ? 0.7 : 0.3 / Math.max(1, options.length - 1);
  const k = options.length;
  return { type: "choice", choice: chosen, probabilities, confidence: (k * 0.7 - 1) / (k - 1) };
}
function createFakeAdapter() {
  return {
    adapter: "fake",
    model: FAKE_MODEL,
    async ask(questions, state) {
      const answers = {};
      for (const q of questions) {
        answers[q.id] = q.type === "noul" ? answerNoul(q, state) : q.type === "score" ? answerScore(q, state) : answerChoice(q, state);
      }
      return { answers, costUsd: 0 };
    }
  };
}

// src/classifier/typesafe/config.ts
var JevConfigError = class extends Error {
  /** 1 (default): a provider problem (no key) — bucketed with other provider errors. 2: a config value the
   *  caller must fix before anything runs (a bad TYPESAFE_BASE_URL) — a usage mistake, not a runtime provider
   *  failure. */
  exit;
  constructor(message, exit = 1) {
    super(message);
    this.name = "JevConfigError";
    this.exit = exit;
  }
};
var JevApiError = class extends Error {
  status;
  retryable;
  retryAfterMs;
  body;
  constructor(message, opts) {
    super(message, opts.cause === void 0 ? void 0 : { cause: opts.cause });
    this.name = "JevApiError";
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
    this.body = opts.body;
  }
};
var DIRECT_BASE_URL = "https://api.typesafe.ai";
var GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
var DEFAULT_PINNED_MODEL = "jev-1.13.0";
var DEFAULT_GATEWAY_MODEL = "typesafe-ai/jev";
var DEFAULT_TIMEOUT_MS = 2e4;
var clean = (v) => {
  const t = v?.trim();
  return t ? t : void 0;
};
function isFloatingModel(model) {
  return /(^|[-/])(latest|preview)$/i.test(model.trim());
}
function resolveRoute(env, deps) {
  const directKey = clean(env.TYPESAFE_API_KEY);
  const gatewayKey = clean(env.AI_GATEWAY_API_KEY);
  if (directKey) return { route: "direct", apiKey: directKey, keySource: "env" };
  if (gatewayKey) return { route: "gateway", apiKey: gatewayKey, keySource: "env" };
  const stored = deps.resolveStored?.();
  if (stored) return { route: stored.provider === "gateway" ? "gateway" : "direct", apiKey: stored.apiKey, keySource: stored.source };
  return { route: "direct", apiKey: void 0 };
}
function resolveTimeoutMs(env, fileConfig) {
  const raw = Number(clean(env.JEV_TIMEOUT_MS));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return fileConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function resolveBaseURL(env, baseDefault, fileConfig) {
  const raw = clean(env.TYPESAFE_BASE_URL) ?? fileConfig?.baseURL;
  if (raw === void 0) return baseDefault;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new JevConfigError(`\u2716 TYPESAFE_BASE_URL: "${raw}" is not a valid URL \u2192 use an https URL, e.g. https://api.example.com`, 2);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol === "https:" || url.protocol === "http:" && local) return raw.replace(/\/+$/, "");
  throw new JevConfigError(
    `\u2716 TYPESAFE_BASE_URL: "${raw}" is ${url.protocol.replace(":", "")}, not https \u2192 use https, or http only for localhost/127.0.0.1/[::1]`,
    2
  );
}
function resolveJevConfig(env = process.env, deps = {}) {
  const model = clean(env.JEV_MODEL) ?? deps.fileConfig?.model ?? DEFAULT_PINNED_MODEL;
  if (isFloatingModel(model)) {
    throw new JevConfigError(
      `JEV_MODEL="${model}" floats. Pin an exact version (e.g. ${DEFAULT_PINNED_MODEL}) so scores are reproducible.`
    );
  }
  const { route, apiKey, keySource } = resolveRoute(env, deps);
  const baseDefault = route === "gateway" ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return {
    route,
    apiKey,
    ...keySource ? { keySource } : {},
    baseURL: resolveBaseURL(env, baseDefault, deps.fileConfig),
    model,
    wireModel: route === "gateway" ? clean(env.JEV_GATEWAY_MODEL) ?? DEFAULT_GATEWAY_MODEL : model,
    timeoutMs: resolveTimeoutMs(env, deps.fileConfig),
    ...deps.fileConfig?.retries !== void 0 ? { retries: deps.fileConfig.retries } : {},
    ...deps.fileConfig?.backoffMs !== void 0 ? { backoffMs: deps.fileConfig.backoffMs } : {},
    pricing: deps.fileConfig?.pricing ?? DEFAULT_CONFIG.pricing
  };
}
function hasKey(config) {
  return config.apiKey !== void 0;
}
function routeLabel(config) {
  const baseDefault = config.route === "gateway" ? GATEWAY_BASE_URL : DIRECT_BASE_URL;
  return config.baseURL === baseDefault ? config.route : "custom";
}

// src/classifier/chaos.ts
var CHAOS_STEPS = ["ok", "401", "429", "503", "529", "timeout", "malformed", "missing"];
var CHAOS_MODEL = "mm3-chaos-1";
var HTTP = {
  "401": { status: 401, text: "invalid API key", retryable: false },
  "429": { status: 429, text: "rate limited", retryable: true },
  "503": { status: 503, text: "service unavailable", retryable: true },
  "529": { status: 529, text: "overloaded", retryable: true }
};
function parseSchedule(raw) {
  const text = (raw ?? "").trim();
  if (!text) return { steps: [] };
  const steps = text.split(",").map((s) => s.trim());
  const bad = steps.find((s) => !CHAOS_STEPS.includes(s));
  if (bad !== void 0) return { stop: `\u2716 provider: MM3_CHAOS has "${clip(bad, 20)}" \u2192 use a comma list of ${CHAOS_STEPS.join(", ")}` };
  return { steps };
}
function stepper(steps, stateFile) {
  let next = 0;
  const schedule = steps.join(",");
  return () => {
    if (!stateFile) return steps[next++] ?? "ok";
    return withLock(`${stateFile}.lock`, () => {
      let at = 0;
      try {
        const s = JSON.parse(readFileSync7(stateFile, "utf8"));
        if (s.schedule === schedule && Number.isInteger(s.next)) at = s.next;
      } catch {
      }
      mkdirSync3(path4.dirname(stateFile), { recursive: true });
      writeFileSync3(`${stateFile}.tmp`, JSON.stringify({ schedule, next: at + 1 }));
      renameSync2(`${stateFile}.tmp`, stateFile);
      return steps[at] ?? "ok";
    });
  };
}
function broken(q) {
  if (q.type === "noul") return { type: "noul", probability: 1.4 };
  if (q.type === "score") return { type: "score", score: 0, distribution: q.levels.map(() => 1.4), confidence: 1 };
  const options = Object.keys(q.options);
  return { type: "choice", choice: options[0], probabilities: Object.fromEntries(options.map((o) => [o, 1.4])), confidence: 1 };
}
function createChaosAdapter(steps, stateFile) {
  const fake = createFakeAdapter();
  const nextStep = stepper(steps, stateFile);
  return {
    adapter: "chaos",
    model: CHAOS_MODEL,
    async ask(questions, state) {
      const step = nextStep();
      const http = HTTP[step];
      if (http) throw new JevApiError(`HTTP ${http.status}: ${http.text}`, { status: http.status, retryable: http.retryable });
      if (step === "timeout") throw new JevApiError("request timed out after 20000ms", { retryable: true });
      const result = await fake.ask(questions, state);
      const first = questions[0];
      if (step === "ok" || !first) return result;
      const answers = { ...result.answers };
      if (step === "missing") delete answers[first.id];
      else answers[first.id] = broken(first);
      return { answers, costUsd: 0 };
    }
  };
}

// src/classifier/typesafe/wire.ts
var isRecord2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function num(v, what) {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new JevApiError(`malformed response: ${what} is not a finite number`, { retryable: false, body: v });
  }
  return v;
}
function buildPayload(request, wireModel) {
  return { model: wireModel, state: request.state, questions: request.questions };
}
function readUsageAndCost(raw) {
  const usage = isRecord2(raw.usage) ? raw.usage : {};
  const gateway = isRecord2(raw.provider_metadata) && isRecord2(raw.provider_metadata.gateway) ? raw.provider_metadata.gateway : {};
  const cost = Number(gateway.cost);
  return {
    usage: {
      inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0
    },
    ...gateway.cost !== void 0 && Number.isFinite(cost) ? { costUsd: cost } : {}
  };
}
function parseRetryAfterMs(headers, now = Date.now()) {
  const ms = headers.get("retry-after-ms");
  if (ms !== null && Number.isFinite(Number(ms)) && Number(ms) >= 0) return Number(ms);
  const raw = headers.get("retry-after");
  if (raw === null) return void 0;
  if (Number.isFinite(Number(raw))) return Number(raw) >= 0 ? Number(raw) * 1e3 : void 0;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - now);
}
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500 && status <= 599;
}
async function fetchWithTimeout(config, doFetch, url, key2, payload, opts) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });
  if (opts.signal?.aborted) controller.abort();
  try {
    return await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key2}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (cause) {
    if (opts.signal?.aborted) throw new JevApiError("request aborted by caller", { retryable: false, cause });
    throw new JevApiError(
      timedOut ? `request timed out after ${config.timeoutMs}ms` : `connection error: ${cause.message}`,
      { retryable: true, cause }
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}
function detailOf(body) {
  if (!isRecord2(body)) return String(body).slice(0, 200);
  const err2 = body.error;
  if (isRecord2(err2) && typeof err2.message === "string") return err2.message;
  if (typeof body.message === "string") return body.message;
  if (typeof err2 === "string") return err2;
  return JSON.stringify(body);
}
async function postSystemOne(config, doFetch, key2, payload, opts) {
  const res = await fetchWithTimeout(config, doFetch, `${config.baseURL}/v1/systemone`, key2, payload, opts);
  const text = await res.text().catch(() => "");
  let body = text;
  try {
    body = text ? JSON.parse(text) : void 0;
  } catch {
  }
  if (!res.ok) {
    const retryAfterMs = parseRetryAfterMs(res.headers);
    throw new JevApiError(`HTTP ${res.status}: ${detailOf(body)}`, {
      status: res.status,
      retryable: isRetryableStatus(res.status),
      ...retryAfterMs !== void 0 ? { retryAfterMs } : {},
      body
    });
  }
  return { body, requestId: res.headers.get("x-typesafe-request-id") };
}

// src/classifier/typesafe/answers.ts
function noulQuestion(instructions) {
  return { type: "noul", instructions };
}
function choiceQuestion(instructions, options) {
  if (options.length < 2 || options.length > 255 || new Set(options).size !== options.length) {
    throw new RangeError(`a choice question needs 2-255 distinct options, got ${options.length}`);
  }
  return { type: "choice", instructions, criteria: Object.fromEntries(options.map((o) => [o, o])) };
}
function scoreQuestion(instructions, levels) {
  if (levels.length < 2 || levels.length > 10) throw new RangeError(`a score question needs 2-10 levels, got ${levels.length}`);
  return { type: "score", instructions, criteria: [...levels] };
}
function costOf(model, usage, reported, pricing) {
  if (reported !== void 0) return { costUsd: reported };
  const rate = pricing?.[model];
  if (!rate) return {};
  let costUsd = 0;
  let has = false;
  if (rate.inputPerMTok !== void 0) {
    costUsd += usage.inputTokens / 1e6 * rate.inputPerMTok;
    has = true;
  }
  if (rate.outputPerMTok !== void 0) {
    costUsd += usage.outputTokens / 1e6 * rate.outputPerMTok;
    has = true;
  }
  if (rate.perCall !== void 0) {
    costUsd += rate.perCall;
    has = true;
  }
  return has ? { costUsd, costEstimated: true } : {};
}
var malformed = (message, body) => new JevApiError(`malformed response: ${message}`, { retryable: false, body });
var confidenceOr = (raw, fallback) => typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : fallback;
function normalized(values, id, body) {
  const sum = values.reduce((s, v) => s + v, 0);
  if (sum <= 0) throw malformed(`${id}.probabilities sum to zero`, body);
  return values.map((v) => v / sum);
}
function probabilityAt(raw, key2, id) {
  const probs = raw.probabilities;
  if (probs[key2] === void 0) return 0;
  const v = num(probs[key2], `${id}.probabilities.${key2}`);
  if (v < 0) throw malformed(`${id}.probabilities.${key2} is negative`, raw);
  return v;
}
function readNoul(raw, id) {
  const probability = num(raw.noul, `${id}.noul`);
  if (probability < 0 || probability > 1) throw malformed(`${id}.noul must be in [0, 1], got ${probability}`, raw);
  return { type: "noul", probability, confidence: confidenceOr(raw, Math.abs(2 * probability - 1)) };
}
function readChoice(raw, id, options) {
  if (!isRecord2(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const o of Object.keys(raw.probabilities)) {
    if (!options.includes(o)) throw malformed(`${id}.probabilities has option "${o}", not in the request's options`, raw);
  }
  const dist = normalized(options.map((o) => probabilityAt(raw, o, id)), id, raw);
  const probabilities = Object.fromEntries(options.map((o, i) => [o, dist[i]]));
  const choice = typeof raw.choice === "string" && options.includes(raw.choice) ? raw.choice : options.reduce((best, o) => probabilities[o] > probabilities[best] ? o : best, options[0]);
  const k = options.length;
  return { type: "choice", choice, probabilities, confidence: confidenceOr(raw, (k * Math.max(...dist) - 1) / (k - 1)) };
}
function readScore(raw, id, n) {
  if (!isRecord2(raw.probabilities)) throw malformed(`${id}.probabilities must be an object`, raw);
  for (const key2 of Object.keys(raw.probabilities)) {
    if (!/^\d+$/u.test(key2) || Number(key2) >= n) throw malformed(`${id}.probabilities has level "${key2}", but the question has ${n} levels`, raw);
  }
  const distribution = normalized(Array.from({ length: n }, (_, i) => probabilityAt(raw, String(i), id)), id, raw);
  const score = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : distribution.reduce((s, p, i) => s + p * i, 0);
  return { type: "score", score, distribution, confidence: confidenceOr(raw, (n * Math.max(...distribution) - 1) / (n - 1)) };
}
function parseAnswers(raw, questions, pricing = DEFAULT_CONFIG.pricing) {
  if (!isRecord2(raw) || !isRecord2(raw.answers)) throw malformed("missing `answers`", raw);
  const answers = {};
  for (const [id, q] of Object.entries(questions)) {
    const a = raw.answers[id];
    if (!isRecord2(a)) throw malformed(`no answer for question "${id}"`, a);
    if (a.type !== void 0 && a.type !== q.type) throw malformed(`answer "${id}" has type "${String(a.type)}", expected "${q.type}"`, a);
    answers[id] = q.type === "noul" ? readNoul(a, id) : q.type === "choice" ? readChoice(a, id, Object.keys(q.criteria)) : readScore(a, id, q.criteria.length);
  }
  const model = typeof raw.model === "string" ? raw.model : "";
  const { usage, costUsd } = readUsageAndCost(raw);
  return { model, answers, usage, ...costOf(model, usage, costUsd, pricing) };
}

// src/classifier/typesafe/client.ts
var NO_KEY_MESSAGE = "\u2716 provider: no TypeSafe key \u2192 set TYPESAFE_API_KEY (direct) or AI_GATEWAY_API_KEY (gateway), or MM3_PROVIDER=fake to try requests";
var MAX_RETRIES = 2;
var BASE_BACKOFF_MS = 1e3;
var MAX_BACKOFF_MS = 1e4;
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function backoffMs(attempt, base0) {
  const base = Math.min(base0 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  return Math.min(base + Math.random() * base * 0.2, MAX_BACKOFF_MS);
}
function createJevClient(config, deps = {}) {
  const key2 = config.apiKey;
  if (key2 === void 0) throw new JevConfigError(NO_KEY_MESSAGE);
  const doFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const maxRetries = config.retries ?? MAX_RETRIES;
  const base0 = config.backoffMs ?? BASE_BACKOFF_MS;
  return {
    config,
    async ask(request, opts = {}) {
      const payload = buildPayload(request, config.wireModel);
      for (let attempt = 1; ; attempt++) {
        try {
          const { body, requestId } = await postSystemOne(config, doFetch, key2, payload, opts);
          const parsed = parseAnswers(body, request.questions, config.pricing);
          return { ...parsed, ...requestId ? { requestId } : {}, retries: attempt - 1 };
        } catch (e) {
          if (!(e instanceof JevApiError) || !e.retryable || attempt > maxRetries) throw e;
          const waitMs = e.retryAfterMs !== void 0 ? Math.min(e.retryAfterMs, MAX_BACKOFF_MS) : backoffMs(attempt, base0);
          await sleep(waitMs);
        }
      }
    }
  };
}

// src/classifier/typesafe/adapter.ts
var NO_TYPESAFE_KEY_MESSAGE = "\u2716 provider: no TypeSafe key \u2192 set TYPESAFE_API_KEY or AI_GATEWAY_API_KEY, or MM3_PROVIDER=fake to try requests";
function createTypesafeAdapter(env = process.env, deps = {}) {
  const config = resolveJevConfig(env, { resolveStored: deps.resolveStored, fileConfig: deps.fileConfig });
  if (!hasKey(config)) throw new JevConfigError(NO_TYPESAFE_KEY_MESSAGE);
  registerSecret(config.apiKey);
  const client = createJevClient(config, deps);
  return {
    adapter: "typesafe",
    model: config.model,
    async ask(questions, state) {
      if (!questions.length) return { answers: {}, costUsd: 0 };
      const wire = {};
      for (const q of questions) {
        const instructions = q.item === void 0 ? q.ask : { item: q.item, question: q.ask };
        wire[q.id] = q.type === "noul" ? noulQuestion(instructions) : q.type === "score" ? scoreQuestion(instructions, q.levels) : choiceQuestion(instructions, Object.keys(q.options));
      }
      const res = await client.ask({ state, questions: wire });
      const answers = {};
      for (const q of questions) {
        const a = res.answers[q.id];
        if (a.type === "noul") answers[q.id] = { type: "noul", probability: a.probability };
        else if (a.type === "score") answers[q.id] = { type: "score", score: a.score, distribution: a.distribution, confidence: a.confidence };
        else answers[q.id] = { type: "choice", choice: a.choice, probabilities: a.probabilities, confidence: a.confidence };
      }
      return { answers, costUsd: res.costUsd, costEstimated: res.costEstimated, usage: res.usage, retries: res.retries };
    }
  };
}

// src/classifier/select.ts
function wantedProvider(env, deps) {
  return env.MM3_PROVIDER?.trim() || deps.fileConfig?.provider;
}
function selectProvider(env = process.env, deps = {}) {
  const wanted = wantedProvider(env, deps);
  if (wanted === "fake") return createFakeAdapter();
  if (wanted === "chaos") {
    const s = parseSchedule(env.MM3_CHAOS);
    if ("stop" in s) throw new Error(s.stop);
    return createChaosAdapter(s.steps, deps.chaosState);
  }
  if (wanted === "typesafe") return createTypesafeAdapter(env, deps);
  if (wanted) throw new Error(`\u2716 provider: "${wanted}" is not a provider \u2192 use fake, chaos or typesafe`);
  return hasKey(resolveJevConfig(env, deps)) ? createTypesafeAdapter(env, deps) : createFakeAdapter();
}
function providerIdentity(env = process.env, deps = {}) {
  const wanted = wantedProvider(env, deps);
  if (wanted === "fake") return { adapter: "fake", model: FAKE_MODEL, route: "fake", baseURL: null };
  if (wanted === "chaos") return { adapter: "chaos", model: CHAOS_MODEL, route: "chaos", baseURL: null };
  try {
    const config = resolveJevConfig(env, deps);
    if (wanted === "typesafe" || hasKey(config)) return { adapter: "typesafe", model: config.model, route: routeLabel(config), baseURL: config.baseURL };
  } catch {
    return { adapter: "typesafe", model: "unknown", route: "custom", baseURL: null };
  }
  return { adapter: "fake", model: FAKE_MODEL, route: "fake", baseURL: null };
}

// src/config/config.ts
import { existsSync as existsSync6, readdirSync, readFileSync as readFileSync9, writeFileSync as writeFileSync4 } from "node:fs";
import path5 from "node:path";

// src/contract/emit.ts
var m = (...entries) => new Map(entries);
var RESERVED = /^(?:true|false|null|~|yes|no|on|off|y|n)$/iu;
var NUMBER_LIKE = /^(?:[-+]?(?:\d+|\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/u;
var INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/u;
var BLOCK_TOP = /* @__PURE__ */ new Set(["mak", "plan", "doctor", "config"]);
function scalar(s, flow2) {
  const plain = s !== "" && s === s.trim() && !RESERVED.test(s) && !NUMBER_LIKE.test(s) && !INDICATOR.test(s) && !/: |:$| #|[\n\r\t]/u.test(s) && !(flow2 && /[,[\]{}]/u.test(s));
  return plain ? s : JSON.stringify(s);
}
var num2 = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2);
var key = (k, flow2) => /^[1-9]\d*$/u.test(k) ? k : scalar(k, flow2);
function flow(v) {
  if (v instanceof Map) return `{${[...v].map(([k, x]) => `${key(k, true)}: ${flow(x)}`).join(", ")}}`;
  if (Array.isArray(v)) return `[${v.map(flow).join(", ")}]`;
  if (typeof v === "number") return num2(v);
  if (typeof v === "boolean") return String(v);
  if (v === null) return "null";
  return scalar(v, true);
}
function inline(v) {
  return typeof v === "string" ? scalar(v, false) : flow(v);
}
var isMapOfMaps = (v) => v instanceof Map && v.size > 0 && [...v.values()].every((x) => x instanceof Map);
function emit(doc) {
  const lines = [];
  for (const [k, v] of doc) {
    if (!(BLOCK_TOP.has(k) && v instanceof Map)) {
      lines.push(`${key(k, false)}: ${inline(v)}`);
      continue;
    }
    lines.push(`${key(k, false)}:`);
    for (const [k2, v2] of v) {
      if (isMapOfMaps(v2)) {
        lines.push(`  ${key(k2, false)}:`);
        for (const [k3, v3] of v2) lines.push(`    ${key(k3, false)}: ${flow(v3)}`);
      } else {
        lines.push(`  ${key(k2, false)}: ${inline(v2)}`);
      }
    }
  }
  return `${lines.join("\n")}
`;
}

// src/config/receipt.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync5, readFileSync as readFileSync8 } from "node:fs";
var fingerprintOf = (text) => createHash2("sha256").update(text).digest("hex");
function configStatus(paths) {
  let text;
  if (paths && existsSync5(paths.config)) {
    try {
      text = readFileSync8(paths.config, "utf8");
    } catch {
      text = void 0;
    }
  }
  const latest = paths ? latestConfigRecord(paths) : void 0;
  if (text === void 0) return latest && !latest.absent ? { kind: "gone", loadedAt: latest.ts, fileStops: [] } : { kind: "defaults", fileStops: [] };
  const fileStops = checkConfigText(text).stops;
  if (fileStops.length) return { kind: "invalid", fileStops };
  if (!latest) return hasSettings(text) ? { kind: "unrecorded", fileStops } : { kind: "defaults", fileStops };
  return latest.fingerprint === fingerprintOf(text) ? { kind: "loaded", loadedAt: latest.ts, fileStops } : { kind: "unrecorded", fileStops };
}
function statusLine(s) {
  switch (s.kind) {
    case "defaults":
      return void 0;
    case "loaded":
      return `config: loaded ${s.loadedAt}`;
    case "unrecorded":
      return "\u26A0 config.yaml is in effect but its latest change is not recorded \u2192 mm3 config --load";
    case "gone":
      return `\u26A0 config.yaml is gone (last loaded ${s.loadedAt}) \u2192 the defaults apply; run mm3 config --load to record the defaults, or restore the file`;
    case "invalid":
      return "\u2716 config.yaml has a problem \u2192 fix it: paid runs stop until you do";
  }
}

// src/config/config.ts
var valueText = (v) => typeof v === "string" ? scalar(v, false) : Array.isArray(v) ? `[${v.join(", ")}]` : String(v);
function fieldLine(indent3, key2, source, value, example, extra = "") {
  if ((source === "config" || source === "env") && value !== void 0) {
    return `${indent3}${key2}: ${valueText(value)}  # ${source === "config" ? "from config.yaml" : "env"}${extra}`;
  }
  if (value !== void 0) return `${indent3}# ${key2}: ${valueText(value)}  # default${extra}`;
  if (source === "env") return `${indent3}# ${key2}: (set via env, not config.yaml)`;
  return `${indent3}# ${key2}: ${valueText(example)}  # example`;
}
var EXAMPLES = {
  "budget.since": "2026-01-01T00:00:00Z",
  provider: "typesafe",
  baseURL: "https://api.typesafe.ai",
  model: "jev-1.13.0",
  "sweep.maxItems": 30,
  "reuse.maxAgeDays": 30,
  "reuse.maxCommits": 20
};
var ex = (key2) => EXAMPLES[key2];
var ITEM_TIERS2 = ["quick", "standard", "thorough"];
var DEPTH_VERBS2 = ["class", "scan", "loop"];
var EVIDENCE_FIELDS2 = ["perItemChars", "totalChars", "maxFiles"];
var LENS_FIELDS2 = ["concernAt", "weakBelow", "strongAt"];
var PRICING_FIELDS = ["inputPerMTok", "outputPerMTok", "perSecond", "perCall"];
function pricingLines(resolved) {
  const lines = ["  pricing:"];
  for (const [model, rate] of Object.entries(resolved.config.pricing)) {
    lines.push(`    ${scalar(model, false)}:`);
    const modelSource = resolved.sources[`pricing.${model}`];
    for (const f of PRICING_FIELDS) {
      const v = rate[f];
      if (v === void 0) continue;
      lines.push(fieldLine("      ", f, resolved.sources[`pricing.${model}.${f}`] ?? modelSource, v, 0));
    }
  }
  return lines;
}
function mdlLines(resolved) {
  const entries = Object.entries(resolved.config.mdl);
  if (!entries.length) return ["  # mdl:", "  #   risk: {values: [low, medium, high]}  # example override"];
  const lines = ["  mdl:"];
  for (const [field, override] of entries) {
    lines.push(`    ${scalar(field, false)}:`);
    for (const [k, v] of Object.entries(override)) {
      const text = Array.isArray(v) ? `[${v.map((x) => scalar(String(x), true)).join(", ")}]` : typeof v === "boolean" ? String(v) : scalar(String(v), false);
      lines.push(`      ${k}: ${text}  # from config.yaml`);
    }
  }
  return lines;
}
var configFileLabel = (projectLine2) => projectLine2 === "." || projectLine2 === "none" ? ".mm3/config.yaml" : `${projectLine2}/.mm3/config.yaml`;
var customizeNote = (projectLine2) => projectLine2 === "none" ? "to customize: run mm3 config --write inside a project \u2192 writes .mm3/config.yaml with a commented guide" : "to customize: run mm3 config --write \u2192 writes .mm3/config.yaml with a commented guide";
function formatConfig(resolved, projectLine2, extraNotes = []) {
  const c = resolved.config;
  const s = resolved.sources;
  const lines = [
    "config:",
    `  project: ${scalar(projectLine2, false)}`,
    "",
    "  budget:",
    fieldLine("    ", "usd", s["budget.usd"], c.budget.usd, 5),
    fieldLine("    ", "runs", s["budget.runs"], c.budget.runs, 500),
    fieldLine("    ", "per", s["budget.per"], c.budget.per, "total"),
    fieldLine("    ", "since", s["budget.since"], c.budget.since, ex("budget.since")),
    fieldLine("    ", "warnAt", s["budget.warnAt"], c.budget.warnAt, 0.8),
    "",
    fieldLine("  ", "provider", s.provider, c.provider, ex("provider")),
    fieldLine("  ", "baseURL", s.baseURL, c.baseURL, ex("baseURL")),
    fieldLine("  ", "model", s.model, c.model, ex("model")),
    "",
    ...pricingLines(resolved),
    "",
    fieldLine("  ", "timeoutMs", s.timeoutMs, c.timeoutMs, 2e4),
    fieldLine("  ", "retries", s.retries, c.retries, 2),
    fieldLine("  ", "backoffMs", s.backoffMs, c.backoffMs, 1e3),
    "",
    "  sweep:",
    fieldLine("    ", "maxItems", s["sweep.maxItems"], c.sweep.maxItems, ex("sweep.maxItems")),
    fieldLine("    ", "maxQuestionsPerCall", s["sweep.maxQuestionsPerCall"], c.sweep.maxQuestionsPerCall, 500),
    "    itemsPerLayer:",
    ...ITEM_TIERS2.map((t) => fieldLine("      ", t, s[`sweep.itemsPerLayer.${t}`], c.sweep.itemsPerLayer[t], 10)),
    "",
    fieldLine("  ", "requestMaxBytes", s.requestMaxBytes, c.requestMaxBytes, 1048576),
    "",
    "  reuse:",
    fieldLine("    ", "maxAgeDays", s["reuse.maxAgeDays"], c.reuse.maxAgeDays, ex("reuse.maxAgeDays")),
    fieldLine("    ", "maxCommits", s["reuse.maxCommits"], c.reuse.maxCommits, ex("reuse.maxCommits")),
    "",
    "  depth:",
    ...DEPTH_VERBS2.map((v) => fieldLine("    ", v, s[`depth.${v}`], c.depth[v], [3, 6, 9], ` \xB7 ${c.depth[v].map((n) => n * 3).join(", ")} questions`)),
    "",
    "  evidence:",
    ...EVIDENCE_FIELDS2.map((f) => fieldLine("    ", f, s[`evidence.${f}`], c.evidence[f], 0)),
    "",
    "  lens:",
    ...LENS_FIELDS2.map((f) => fieldLine("    ", f, s[`lens.${f}`], c.lens[f], 0)),
    "",
    ...mdlLines(resolved),
    "",
    "notes:",
    "  - free: never spends; plain config never writes",
    ...resolved.present ? [`  - customized in ${configFileLabel(projectLine2)} \u2192 edit it (it applies at once), then run mm3 config --load to record the change`] : ["  - no config.yaml here \u2192 every value is a default or env var", `  - ${customizeNote(projectLine2)}`],
    ...extraNotes.map((n) => `  - ${n}`)
  ];
  return `${lines.join("\n")}
`;
}
function nearMissNotes(paths) {
  if (!paths || existsSync6(paths.config)) return [];
  let names;
  try {
    names = readdirSync(paths.dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.toLowerCase().startsWith("config") && n !== "config.yaml" && !n.startsWith("config.active.json")).sort().slice(0, 3).map((n) => `found .mm3/${n} \u2014 did you mean config.yaml? \u2192 rename it`);
}
function runConfig(env, paths, projectLine2) {
  const resolved = resolveConfig(paths, env);
  const status = configStatus(paths);
  const line3 = statusLine(status);
  const notes = [...line3 ? [line3] : [], ...nearMissNotes(paths)];
  if (status.fileStops.length) {
    const stopLines = status.fileStops.map((st) => st.text).join("\n");
    return { exit: 2, text: `${stopLines}

${formatConfig(resolved, projectLine2, notes)}
\u2192 see: mm3 agent config` };
  }
  return { exit: 0, text: formatConfig(resolved, projectLine2, notes) };
}
var HINTS = {
  budget: "spending caps",
  "budget.usd": "dollars MM3 may spend",
  "budget.runs": "paid runs MM3 may make",
  "budget.per": "count the caps: total | day | hour",
  "budget.since": "only count spend after this moment",
  "budget.warnAt": "share of a cap spent before the budget line warns (above 0, up to 1)",
  provider: "typesafe | fake (free sample answers)",
  baseURL: "where classifier calls go (https)",
  model: "the pinned classifier model",
  pricing: "what a call costs, per model, for budget estimates (dollars)",
  timeoutMs: "give up on one call after this many ms",
  retries: "extra tries after a retryable failure",
  backoffMs: "first wait between tries, in ms",
  sweep: "limits on scan and loop",
  "sweep.maxItems": "most items one sweep may look at (can only lower the built-in cap)",
  "sweep.maxQuestionsPerCall": "most questions in one classifier call",
  "sweep.itemsPerLayer": "items asked per layer at each depth",
  "sweep.itemsPerLayer.quick": "items per layer at depth quick",
  "sweep.itemsPerLayer.standard": "items per layer at depth standard",
  "sweep.itemsPerLayer.thorough": "items per layer at depth thorough",
  requestMaxBytes: "largest request file MM3 will read",
  depth: "probes (3 questions each) at quick, standard, thorough, per verb",
  "depth.class": "class: three whole numbers, ascending",
  "depth.scan": "scan: three whole numbers, ascending",
  "depth.loop": "loop: three whole numbers, ascending",
  evidence: "how much code or text one call may carry",
  "evidence.perItemChars": "characters kept per file or item",
  "evidence.totalChars": "characters kept in one call (at least perItemChars)",
  "evidence.maxFiles": "files one glob may match",
  lens: "consensus thresholds over the yes/no answers (weakBelow < concernAt < strongAt)",
  "lens.concernAt": "a probe at or above this reads as a concern",
  "lens.weakBelow": "consensus is WEAK below this decisiveness",
  "lens.strongAt": "consensus is STRONG at or above this agreement",
  reuse: "when a stored answer is too old to reuse (off unless set)",
  "reuse.maxAgeDays": "re-ask answers older than this many days",
  "reuse.maxCommits": "re-ask after this many commits",
  mdl: "per-field overrides of the mdl catalog (see mm3 agent mdl)"
};
var PRICING_HINTS = {
  inputPerMTok: "dollars per million input tokens",
  outputPerMTok: "dollars per million output tokens",
  perSecond: "dollars per second of compute",
  perCall: "dollars per call"
};
var STARTER_FRONT = [
  "# MM3 project settings (.mm3/config.yaml).",
  "#",
  "# Every setting below is commented out, so MM3 runs on its built-in defaults. To change one, uncomment its",
  '# line (delete the leading "# ") and change the value. To go back to the default, delete the line or comment it',
  "# out again. Run mm3 config to check the file: it lists every problem and where each value comes from. Edits apply",
  "# at once; mm3 config --load checks the file and records the change in the ledger (a bad file is refused).",
  "#",
  "# Precedence: environment variable > this file > built-in default.",
  "# Safe to commit: it holds settings only, never keys (those go in env or the keychain). The ledger is not committed.",
  ""
];
function getIn(root, dotted) {
  let cur = root;
  for (const k of dotted.split(".")) cur = typeof cur === "object" && cur !== null ? cur[k] : void 0;
  return cur;
}
function starterConfig() {
  const val = (key2) => valueText(getIn(DEFAULT_CONFIG, key2) ?? ex(key2));
  const header = (indent3, label, hintKey, hint = HINTS[hintKey]) => `${indent3}${label}:${hint ? `  # ${hint}` : ""}`;
  const setting = (indent3, key2, dotted) => `# ${indent3}${key2}: ${val(dotted)}  # ${HINTS[dotted]}`;
  const top = (key2) => setting("", key2, key2);
  const lines = [
    ...STARTER_FRONT,
    header("", "budget", "budget"),
    setting("  ", "usd", "budget.usd"),
    setting("  ", "runs", "budget.runs"),
    setting("  ", "per", "budget.per"),
    setting("  ", "since", "budget.since"),
    setting("  ", "warnAt", "budget.warnAt"),
    "",
    top("provider"),
    top("baseURL"),
    top("model"),
    "",
    header("", "pricing", "pricing")
  ];
  for (const [model, rate] of Object.entries(DEFAULT_CONFIG.pricing)) {
    lines.push(header("  ", scalar(model, false), "", `also: ${PRICING_FIELDS.filter((f) => rate[f] === void 0).join(", ")}`));
    for (const f of PRICING_FIELDS) {
      const v = rate[f];
      if (v !== void 0) lines.push(`#     ${f}: ${valueText(v)}  # ${PRICING_HINTS[f]}`);
    }
  }
  lines.push(
    "",
    top("timeoutMs"),
    top("retries"),
    top("backoffMs"),
    "",
    header("", "sweep", "sweep"),
    setting("  ", "maxItems", "sweep.maxItems"),
    setting("  ", "maxQuestionsPerCall", "sweep.maxQuestionsPerCall"),
    header("  ", "itemsPerLayer", "sweep.itemsPerLayer"),
    ...ITEM_TIERS2.map((t) => setting("    ", t, `sweep.itemsPerLayer.${t}`)),
    "",
    top("requestMaxBytes"),
    "",
    header("", "reuse", "reuse"),
    setting("  ", "maxAgeDays", "reuse.maxAgeDays"),
    setting("  ", "maxCommits", "reuse.maxCommits"),
    "",
    header("", "depth", "depth"),
    ...DEPTH_VERBS2.map((v) => setting("  ", v, `depth.${v}`)),
    "",
    header("", "evidence", "evidence"),
    ...EVIDENCE_FIELDS2.map((f) => setting("  ", f, `evidence.${f}`)),
    "",
    header("", "lens", "lens"),
    ...LENS_FIELDS2.map((f) => setting("  ", f, `lens.${f}`)),
    "",
    header("", "mdl", "mdl"),
    "#   risk: {values: [low, medium, high]}  # example: your own values for one field"
  );
  return `${lines.join("\n")}
`;
}
function runConfigWrite(paths, projectLine2) {
  if (!paths) return { exit: 2, text: "\u2716 config: no project here \u2192 run inside a project (a folder with .git or .mm3), or set MM3_HOME" };
  const label = configFileLabel(projectLine2);
  const exists = { exit: 0, text: `config: ${label} already exists \u2192 not overwritten; edit it, then run mm3 config --load to activate the change
` };
  if (existsSync6(paths.config)) return exists;
  const wrote = onStore(paths.config, "write", () => {
    ensureDir(paths);
    try {
      const starter = starterConfig();
      writeFileSync4(paths.config, starter, { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code === "EEXIST") return false;
      throw e;
    }
  });
  if (!wrote) return exists;
  return { exit: 0, text: `wrote: ${label}
notes:
  - every setting is commented out \u2192 uncomment a line and change its value, then run mm3 config --load to check and activate it
` };
}
var show = (v) => {
  if (v === void 0) return "(not set)";
  if (Array.isArray(v)) return `[${v.map(show).join(", ")}]`;
  if (typeof v === "object" && v !== null) return `{${Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(", ")}}`;
  return typeof v === "string" ? scalar(v, false) : String(v);
};
var isTree2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function changesFrom(over, def, prefix, out) {
  for (const [k, v] of Object.entries(over)) {
    if (v === void 0) continue;
    const at = prefix ? `${prefix}.${k}` : k;
    const d = def[k];
    if (isTree2(v) && !KEYED_MAPS.includes(prefix)) changesFrom(v, isTree2(d) ? d : {}, at, out);
    else if (JSON.stringify(v) !== JSON.stringify(d)) out.push(`${at}: ${show(d)} \u2192 ${show(v)}`);
  }
}
var MAX_CHANGES_SHOWN = 20;
var isoSeconds = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
var budgetChanged = (a, b) => {
  const d = DEFAULT_CONFIG.budget;
  return (a.budget?.usd ?? d.usd) !== (b.budget?.usd ?? d.usd) || (a.budget?.runs ?? d.runs) !== (b.budget?.runs ?? d.runs) || (a.budget?.per ?? d.per) !== (b.budget?.per ?? d.per);
};
function loadAbsent(paths, now) {
  const previous = latestConfigRecord(paths);
  if (!previous || previous.absent) return { exit: 0, text: "\u2714 no config.yaml \xB7 the defaults already apply \xB7 nothing to record \u2192 mm3 config --write for a starter\n" };
  const previousSettings = previous.settings ?? {};
  const changes = [];
  changesFrom(mergeConfig({}).config, mergeConfig(previousSettings).config, "", changes);
  const restarted = budgetChanged(previousSettings, {});
  ensureDir(paths);
  appendConfig(paths, { fingerprint: fingerprintOf(""), settings: {}, changes, absent: true, ...restarted ? { windowSince: isoSeconds(now) } : previous.windowSince ? { windowSince: previous.windowSince } : {} }, now);
  const shown2 = changes.slice(0, MAX_CHANGES_SHOWN).map((c) => `  ${c}`);
  if (changes.length > shown2.length) shown2.push(`  \u2026 ${changes.length - shown2.length} more`);
  return { exit: 0, text: `${["\u2714 no config.yaml \xB7 the defaults apply \xB7 recorded", ...shown2, ...restarted ? ["  count restarted: the budget changed, so spend is counted from now"] : []].join("\n")}
` };
}
function runConfigLoad(paths, file, cwd, projectLine2, now = Date.now()) {
  if (!paths) return { exit: 2, text: "\u2716 config: no project here \u2192 run inside a project (a folder with .git or .mm3), or set MM3_HOME" };
  const label = configFileLabel(projectLine2);
  if (file === void 0 && !existsSync6(paths.config)) return loadAbsent(paths, now);
  const source = file === void 0 ? paths.config : path5.resolve(cwd, file);
  let text;
  try {
    text = readFileSync9(source, "utf8");
  } catch {
    return {
      exit: 2,
      text: file === void 0 ? `\u2716 config: no ${label} to load \u2192 run mm3 config --write for a starter, or name a file: mm3 config --load <file>
` : `\u2716 config: cannot read "${file}" \u2192 check the path
`
    };
  }
  const checked = checkConfigText(text);
  if (checked.stops.length) {
    return { exit: 2, text: `${checked.stops.map((s) => s.text).join("\n")}
not loaded: nothing was recorded
\u2192 see: mm3 agent config
` };
  }
  const copied = path5.resolve(source) !== path5.resolve(paths.config);
  if (copied) {
    onStore(paths.config, "write", () => {
      ensureDir(paths);
      writeFileSync4(paths.config, text);
    });
  }
  const previous = latestConfigRecord(paths);
  const previousSettings = previous?.settings ?? {};
  const changes = [];
  changesFrom(mergeConfig(checked.overrides).config, mergeConfig(previousSettings).config, "", changes);
  let windowSince;
  let restarted = false;
  if (previous && checked.overrides.budget?.since === void 0) {
    if (budgetChanged(previousSettings, checked.overrides)) {
      windowSince = isoSeconds(now);
      restarted = true;
    } else windowSince = previous.windowSince;
  }
  ensureDir(paths);
  appendConfig(paths, { fingerprint: fingerprintOf(text), settings: checked.overrides, changes, ...windowSince ? { windowSince } : {} }, now);
  const shown2 = changes.slice(0, MAX_CHANGES_SHOWN).map((c) => `  ${c}`);
  if (changes.length > shown2.length) shown2.push(`  \u2026 ${changes.length - shown2.length} more`);
  const head = `\u2714 valid \xB7 loaded \xB7 ${changes.length} changed ${previous ? "since the last load" : "from the defaults"}`;
  const restartLine = restarted ? ["  count restarted: the budget changed, so spend is counted from now"] : [];
  return { exit: 0, text: `${[head, ...shown2, ...restartLine, ...copied ? [`  copied ${file} \u2192 ${label}`] : []].join("\n")}
` };
}

// src/mcp/stdio.ts
import readline from "node:readline";

// src/setup/plugin.ts
import { existsSync as existsSync7, rmSync as rmSync2 } from "node:fs";
import os from "node:os";
import path6 from "node:path";
var SCOPES = ["user", "project", "local"];
var isScope = (v) => typeof v === "string" && SCOPES.includes(v);
function walk(value, scopes, found) {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, scopes, found);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value;
  const name = typeof obj.name === "string" ? obj.name : typeof obj.id === "string" ? obj.id : "";
  if (name === "mm3" || name.startsWith("mm3@")) {
    found.any = true;
    if (isScope(obj.scope)) scopes.add(obj.scope);
  }
  for (const v of Object.values(obj)) walk(v, scopes, found);
}
function pluginStatus(runner) {
  const r = runner("claude", ["plugin", "list", "--json"]);
  if (r.status !== 0) return { installed: false, scopes: [] };
  try {
    const scopes = /* @__PURE__ */ new Set();
    const found = { any: false };
    walk(JSON.parse(r.stdout), scopes, found);
    return { installed: found.any, scopes: [...scopes] };
  } catch {
    return { installed: false, scopes: [] };
  }
}
function marketplaceExists(runner) {
  const r = runner("claude", ["plugin", "marketplace", "list"]);
  return r.status === 0 && /\bmvp-scale\b/u.test(r.stdout);
}
var addMarketplace = (runner, packageDir) => runner("claude", ["plugin", "marketplace", "add", packageDir]);
var installPlugin = (runner, scope) => runner("claude", ["plugin", "install", "mm3@mvp-scale", "--scope", scope]);
var uninstallPlugin = (runner, scope) => runner("claude", ["plugin", "uninstall", "mm3@mvp-scale", ...scope ? ["--scope", scope] : []]);
var removeMarketplace = (runner) => runner("claude", ["plugin", "marketplace", "remove", "mvp-scale"]);
function pluginCacheDir(homeDir = os.homedir()) {
  return path6.join(homeDir, ".claude", "plugins", "cache", "mvp-scale");
}
function removePluginCacheDir(homeDir = os.homedir()) {
  const dir = pluginCacheDir(homeDir);
  if (!existsSync7(dir)) return false;
  rmSync2(dir, { recursive: true, force: true });
  return true;
}
function inPluginContext(env) {
  return Boolean(env.CLAUDE_PLUGIN_ROOT?.trim());
}
var NO_KEY_PLUGIN_HINT = '/plugin \u2192 MM3 \u2192 Configure \u2192 press Enter on "TypeSafe API key", paste, Enter, Save configuration';

// src/help/guidance.ts
var BODY = [
  'IMPORTANT: work top-down. Ask a few high-leverage questions per layer and drill only where MM3 flags something. "Exhaustive" means every layer covered through that funnel, not every file.',
  "- Open goal, in order: `view` (free reuse) \u2192 `scan` only when you do not know where to look \u2192 `drill` the flagged item \u2192 `loop` to check a design. Known location: `class` on the representative code.",
  "- Pilot first: send one small request, read the answer, fix the questions, then widen. Send no more than a few before you have read one.",
  "- A sweep that says `gate: fail` is normal (any file failing any concern fails it): read the failing categories and the `next:` line; do not stop and do not repeat it.",
  '- Before writing a request run `mm3 agent probe` (distinct roles per probe, a "none fits" option on every choice) and tag it with mdl (`uses`, `area`).',
  "- Before a judgment call about code or a design (safe to merge? is it fixed? which option?), get an MM3 verdict: a call costs a fraction of a cent and every run is recorded, so the next decision starts from evidence, not from scratch.",
  "- Cite the run id (MM3-####) for every claim that comes from MM3, and mark the rest as your own reading.",
  "- Delegating? Give helpers `mm3 agent delegate`, and check their reports against the ledger with `mm3 view MM3-####`: a helper can report work it did not do."
];
var LEAD = "Run `mm3 agent` first for the commands and rules, then `mm3 agent <verb>` before writing a request.";
var MM3_GUIDANCE = [`MM3 is active here: use it to ground analysis in evidence, not as an afterthought. ${LEAD}`, ...BODY].join("\n");
var AGENT_POINTER2 = [`If the \`mm3\` tool is available, MM3 is active in this project. ${LEAD}`, ...BODY].join("\n");
var GUIDANCE_BODY = BODY;

// src/help/patterns.ts
var PATTERNS2 = [
  {
    rule: "A file this size gets read past the point that actually matters \u2014 name the range that does, instead of sending the whole file.",
    why: "Big whole files refused \u2014 name the range",
    verb: "view",
    in: ["class", "authoring"],
    catchable: true,
    bad: "mak:\n  goal: This function is safe to merge\n  where: [src/pay/validate.ts]\n",
    good: "mak:\n  goal: This function is safe to merge\n  where: [src/pay/validate.ts:120-180]\n"
  },
  {
    rule: "`where:` is all the code a run sees \u2014 a question about anything outside it has nothing to answer from.",
    why: "Add the range the question is actually about",
    verb: "view",
    in: ["class", "authoring"],
    catchable: false,
    bad: "mak:\n  goal: This handler is safe to merge\n  where: [src/pay/handler.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does validateInput() sanitize the amount field?\n",
    good: "mak:\n  goal: This handler is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does validateInput() sanitize the amount field?\n"
  },
  {
    rule: "With more than one file in `where:`, a question that never names one leaves the classifier guessing which file it means.",
    why: "Name the file in the question, in backticks",
    verb: "view",
    in: ["class", "authoring"],
    catchable: false,
    bad: "mak:\n  goal: The payment path is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does it sanitize the amount field before use?\n",
    good: "mak:\n  goal: The payment path is safe to merge\n  where: [src/pay/handler.ts, src/pay/validate.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does `src/pay/validate.ts` sanitize the amount field before use?\n"
  },
  {
    rule: "`{function}` is filled in per item \u2014 asking about something outside it answers from evidence that item never sent.",
    why: "Ask what {function} itself does, not its caller",
    verb: "scan",
    in: ["scan"],
    catchable: false,
    bad: "mak:\n  goal: Handlers don't trust request input\n  depth: quick\n  over:\n    file: src/handlers/*.ts\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does the caller of {function} sanitize its input first?\n          2: Does {function} put request text straight into a query?\n          3: Does {function} run that query with db.query?\n        access:\n          pass: no\n          4: Does {function} return a record without checking its owner?\n          5: Does {function} skip comparing the record owner to the caller?\n          6: Could {function} be called without a permission check?\n        leaks:\n          pass: no\n          7: Does {function} return a raw database error?\n          8: Does {function} log the request body?\n          9: Does {function}'s response include unrequested fields?\n      decisions:\n        severity:\n          pass: [none]\n          10:\n            scale: How severe is the worst issue?\n            levels: [none, high]\n        route:\n          pass: [ship]\n          11:\n            choice: Where should this go?\n            options: [ship, block]\n",
    good: "mak:\n  goal: Handlers don't trust request input\n  depth: quick\n  over:\n    file: src/handlers/*.ts\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does {function} sanitize its input before use?\n          2: Does {function} put request text straight into a query?\n          3: Does {function} run that query with db.query?\n        access:\n          pass: no\n          4: Does {function} return a record without checking its owner?\n          5: Does {function} skip comparing the record owner to the caller?\n          6: Could {function} be called without a permission check?\n        leaks:\n          pass: no\n          7: Does {function} return a raw database error?\n          8: Does {function} log the request body?\n          9: Does {function}'s response include unrequested fields?\n      decisions:\n        severity:\n          pass: [none]\n          10:\n            scale: How severe is the worst issue?\n            levels: [none, high]\n        route:\n          pass: [ship]\n          11:\n            choice: Where should this go?\n            options: [ship, block]\n"
  },
  {
    rule: "`view` checks reuse for one subject against the code in `where:` \u2014 with none named, it has nothing to check.",
    why: "View needs where: to check for reuse",
    verb: "view",
    in: ["view"],
    catchable: true,
    bad: "mak:\n  goal: This handler is safe to merge\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does the handler sanitize the amount field before use?\n",
    good: "mak:\n  goal: This handler is safe to merge\n  where: [src/pay/handler.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does the handler sanitize the amount field before use?\n"
  },
  {
    rule: "`over:` builds a sweep across many items \u2014 `view` checks one subject and rejects `over:` outright.",
    why: "Over: is for sweeps; view checks one thing",
    verb: "view",
    in: ["view"],
    catchable: true,
    bad: "mak:\n  goal: The handler is safe to merge\n  where: [src/pay/handler.ts]\n  over:\n    file: src/pay/*.ts\n    function: each\n  ask:\n    function:\n      concerns:\n        injection:\n          pass: no\n          1: Does {function} put request text straight into a query?\n",
    good: "mak:\n  goal: The handler is safe to merge\n  where: [src/pay/handler.ts]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does the handler put request text straight into a query?\n"
  },
  {
    rule: "`loop` sweeps ideas you write yourself, not files on disk \u2014 a code-glob layer belongs to `scan`, not `loop`.",
    why: "Loop sweeps written ideas, not file globs",
    verb: "loop",
    in: ["loop"],
    catchable: true,
    bad: "mak:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    file: src/checkout/*.ts\n  ask:\n    file:\n      concerns:\n        done:\n          pass: yes\n          1: Does {file} own one clear responsibility?\n",
    good: "mak:\n  goal: The checkout redesign is sound\n  depth: quick\n  over:\n    part: [gateway, payments, ledger]\n  ask:\n    part:\n      concerns:\n        responsibility:\n          pass: yes\n          1: Does {part} own one clear responsibility?\n          2: Can {part} be deployed without the others?\n          3: Would another part need to change if {part} changed?\n        dependency:\n          pass: no\n          4: Does {part} reach into another part's own data?\n          5: Does {part} depend on another part's release order?\n          6: Would removing another part break {part} silently?\n        testability:\n          pass: yes\n          7: Can {part} be tested without standing up the others?\n          8: Does {part} expose a clear boundary to test against?\n          9: Is {part} small enough to review on its own?\n      decisions:\n        risk:\n          pass: [none]\n          10:\n            scale: How risky is {part}?\n            levels: [none, high]\n        route:\n          pass: [build-now]\n          11:\n            choice: What should happen to {part} next?\n            options: [build-now, rework]\n"
  },
  // Round-4 finding: `agent drill`/`agent change` had no patterns section at all — the two pairs below close
  // that gap, one each, both caught outright by validate.ts's NEEDS/NEVER cross-validator checks. [C-193]
  {
    rule: "`drill` needs `from:` \u2014 the item or category of the parent run to go down into \u2014 without it there's nothing to drill from.",
    why: "Drill needs from: which item or category",
    verb: "drill",
    in: ["drill"],
    catchable: true,
    bad: "mak:\n  goal: Find exactly where request text reaches the query\n  parent: MM3-0051\n  ask:\n    concerns:\n      source:\n        pass: no\n        1: Is the value concatenated straight into the string?\n        2: Does it skip a parameterized query?\n        3: Is the value taken from request input without validation?\n    decisions:\n      severity:\n        pass: [none]\n        4:\n          scale: How severe is this?\n          levels: [none, high]\n      route:\n        pass: [ship]\n        5:\n          choice: Where should this go?\n          options: [ship, block]\n",
    good: "mak:\n  goal: Find exactly where request text reaches the query\n  parent: MM3-0051\n  from: access\n  ask:\n    concerns:\n      source:\n        pass: no\n        1: Is the value concatenated straight into the string?\n        2: Does it skip a parameterized query?\n        3: Is the value taken from request input without validation?\n    decisions:\n      severity:\n        pass: [none]\n        4:\n          scale: How severe is this?\n          levels: [none, high]\n      route:\n        pass: [ship]\n        5:\n          choice: Where should this go?\n          options: [ship, block]\n"
  },
  {
    rule: "`replay` re-runs the parent run's own questions \u2014 it never takes `ask:`; write new questions with `class` instead.",
    why: "Replay re-runs parent's questions; never ask:",
    verb: "replay",
    in: ["replay"],
    catchable: true,
    bad: "mak:\n  goal: The injection fix works\n  parent: MM3-0042\n  compare: {before: main, after: HEAD}\n  expect: [injection]\n  ask:\n    concerns:\n      injection:\n        pass: no\n        1: Does it still concatenate the value into the query?\n        2: Does it skip a parameterized query?\n        3: Is the value taken from request input without validation?\n",
    good: "mak:\n  goal: The injection fix works\n  parent: MM3-0042\n  compare: {before: main, after: HEAD}\n  expect: [injection]\n"
  }
];
var indent = (text, pad) => text.trimEnd().split("\n").map((l) => `${pad}${l}`);
function proseLines(tag) {
  const list3 = PATTERNS2.filter((p) => p.in.includes(tag));
  if (!list3.length) return [];
  return [
    "",
    "## Good / bad",
    ...list3.flatMap((p, i) => [
      ...i ? [""] : [],
      `- ${p.rule}`,
      "  bad:",
      ...indent(p.bad, "    "),
      "  good:",
      ...indent(p.good, "    ")
    ])
  ];
}
function terseLines(tag) {
  const list3 = PATTERNS2.filter((p) => p.in.includes(tag));
  if (!list3.length) return [];
  return [
    "patterns:",
    ...list3.flatMap((p) => [`- why: ${p.why}`, "  bad:", ...indent(p.bad, "    "), "  good:", ...indent(p.good, "    ")])
  ];
}

// src/help/report.ts
var TOOL_LINE = {
  report: "brief from history; free, no new checks",
  outcome: "record held/overruled/failed on a run (held needs a second actor)",
  budget: "show or set the spend and run caps",
  template: "print a valid starting request for a verb"
};
var REPORT_PAIRS = [
  {
    rule: "there is no view beyond hits, patterns, history, web, graph, problems, mdl, calls and fields \u2014 nothing else to ask it for.",
    bad: [
      "mm3 report level2",
      '\u2192 \u2716 report: "level2" is not a view \u2192 use hits, patterns, history, web, graph, problems, mdl, calls or fields'
    ],
    good: ["mm3 report patterns"]
  }
];
var OUTCOME_PAIRS = [
  {
    rule: "an agent can't certify its own run as correct \u2014 `held` needs a second party.",
    bad: [
      "mm3 outcome MM3-0002 held --by claude   # claude is the actor that asked MM3-0002",
      `\u2192 \u2716 outcome: claude asked MM3-0002, so it can't mark it held \u2192 another agent or the owner records "held"`
    ],
    good: ["mm3 outcome MM3-0002 held --by <the user or a reviewer agent, not you>"]
  },
  {
    rule: "`outcome` takes no reason field.",
    bad: [
      'mm3 outcome MM3-0002 overruled --by claude --note "wrong file blamed"',
      "\u2192 \u2716 args: unknown flag --note \u2192 mm3 outcome <MM3-####> held|overruled|failed --by <actor>"
    ],
    good: ["mm3 outcome MM3-0002 overruled --by claude   # keep the reason in your own notes"]
  }
];
var BUDGET_PAIRS = [
  {
    rule: "the caps are changed in the config, not here.",
    bad: ["mm3 budget set --usd 5", "\u2192 \u2716 budget: set was removed \u2192 edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load"],
    good: ["# edit budget.usd / budget.runs in .mm3/config.yaml, then:", "mm3 config --load"]
  }
];
var indent2 = (lines, pad) => lines.map((l) => `${pad}${l}`);
function proseCliPairs(pairs) {
  return [
    "",
    "## Good / bad",
    ...pairs.flatMap((p, i) => [...i ? [""] : [], `- ${p.rule}`, "  bad:", ...indent2(p.bad, "    "), "  good:", ...indent2(p.good, "    ")])
  ];
}
function reportHelp() {
  return [
    "## report",
    "A free, read-only view across everything the ledger holds, not one place: what's known, what recurs, what changed.",
    "When: briefing a teammate or picking up a codebase cold, instead of hand-assembling several `view` calls.",
    "",
    "Example:",
    "mm3 report            # same as: mm3 report hits",
    "mm3 report patterns",
    "mm3 report history",
    "mm3 report web        # writes .mm3/viewer.html and tries to open it",
    "",
    "Sharp rules:",
    "- free: never calls a provider, never writes to the ledger, and works even with no on-disk index.",
    "- no options beyond the view name \u2014 hits (default), patterns, history or web; anything else is a stop.",
    "- `hits`: the newest run's own gate per place, worst first; a one-subject answer is flagged `stale` once the code there has changed since.",
    "- `patterns`: every distinct question set ever run, with its pass/fail/unsure split, places touched, and outcomes.",
    "- `history`: a merged, newest-first feed of `replay` results (fixed/regressed) and recorded outcomes.",
    "- `web`: writes one self-contained `.mm3/viewer.html` (a place x concern consensus map, a heat map, a session summary) and tries to open it in a browser; always prints the file's path, opened or not. The only view that writes anything, and only ever that one file \u2014 never the ledger.",
    "- every view caps its rows and says plainly how many more exist, rather than dropping them silently.",
    ...proseCliPairs(REPORT_PAIRS)
  ].join("\n");
}
function outcomeHelp() {
  return [
    "## outcome",
    "Records what happened to a run after the fact, so weak spots roll up later in `mm3 report history`: `held` (it was right), `overruled` (it was wrong) or `failed` (it was useless). Not a mak:-YAML verb: it never calls a provider, only appends one line to the ledger.",
    "",
    "Example:",
    "mm3 outcome MM3-0002 overruled --by claude",
    "mm3 outcome MM3-0002 held --by the-owner       # a different actor than the one who asked it",
    "",
    "Sharp rules:",
    "- exact form: mm3 outcome <MM3-####> held|overruled|failed --by <actor> \u2014 no other flags (there is no `--note`; keep a reason in your own notes, not here).",
    "- the agent that asked a run can't mark it `held` itself \u2014 `overruled` and `failed` have no such restriction.",
    '- recording the exact same outcome, by the exact same actor, again is a no-op (exit 0, "already recorded by <actor>"), not a second entry.',
    ...proseCliPairs(OUTCOME_PAIRS)
  ].join("\n");
}
function doctorHelp() {
  return [
    "## doctor",
    "Free, offline, no key needed. Not a mak:-YAML verb: it never calls a provider. Bare `doctor` reports which provider/key/project would answer a real call, plus the Node/node:sqlite runtime and, when a project is found, whether `.mm3/config.yaml` is valid. `doctor <file>` (or `-` for stdin) instead checks just that one document, with no project needed at all: a `mak:` key means a request, checked the same way --dry-run would; anything else is checked as a config.yaml-shaped file.",
    "",
    "Example:",
    "mm3 doctor                    # the full system report",
    "mm3 doctor .mm3/config.yaml",
    "mm3 doctor my-request.yaml",
    "cat my-request.yaml | mm3 doctor -",
    "",
    "Sharp rules:",
    "- exit 0 clean, exit 2 with every problem found in one pass \u2014 never calls the classifier, never writes anything.",
    "- `doctor <file|->` never touches the ledger, reuse or budget, even from inside a real project.",
    "- kind is auto-detected (a top-level `mak:` key means a request); it is never guessed from the file name or extension."
  ].join("\n");
}
function budgetHelp() {
  return [
    "## budget",
    "Shows the project's spend and run count, and how to change the caps. Not a mak:-YAML verb: it never calls a provider and never writes. The caps live in `.mm3/config.yaml` (`budget.usd`, `budget.runs`); change one and run `mm3 config --load`.",
    "",
    "Example:",
    "mm3 budget                          # the count, and the way to change it",
    "",
    "# to raise the cap: edit .mm3/config.yaml, then",
    "mm3 config --load",
    "",
    "Sharp rules:",
    "- read-only: `show` is the only subcommand. `set` and `reset` were removed and stop with where to go.",
    "- a load whose `budget:` section changed (usd, runs or per) restarts the count from that moment; a load that changes other settings keeps it. To restart with the same caps, set `budget.since` to now.",
    "- any verb call that would go over either cap stops at exit 3 before it spends anything.",
    ...proseCliPairs(BUDGET_PAIRS)
  ].join("\n");
}

// src/contract/schema-check.ts
var TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
var RUN_ID2 = /^(?:MM3|SW)-\d{4,}$/u;
var PATH = /^[^\s:]+(:\d+(-\d+)?)?$/u;
var QNUM = /^[1-9][0-9]*$/u;
var MAK_KEYS = ["goal", "depth", "where", "parent", "ask", "over", "from", "compare", "verb", "expect"];
var CATEGORY_KEYS = ["pass", "need", "tags", "family"];
var SECTION_NAMES = ["concerns", "decisions"];
var NOT_QUESTIONS = /^(yes|no|true|false|on|off|y|n)$/iu;
var isObj3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var len = (s) => [...s].length;
var show2 = (v) => clip(typeof v === "string" ? `"${v}"` : JSON.stringify(v) ?? String(v), 40);
var list = (xs) => `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`;
var isTag = (k) => TAG.test(k) && len(k) <= 20;
var Out = class {
  stops = [];
  /** A `mdl.*` stop (or the bare `mdl` block-cap stop) earns its own deeper pointer, the same way
   *  validate.ts's cross stops already embed "→ see: mm3 agent probe" directly in their own text —
   *  the generic trailing "→ see: mm3 agent <verb>" that stopText (verbs/request.ts)
   *  appends to the whole response still fires afterward regardless; this is an ADDITIONAL, more specific line
   *  for mdl fields, since the mdl legend lives at `mm3 agent mdl`, not at the verb's own card. */
  add(field, problem, fix) {
    const mdlPointer = field === "mdl" || field.startsWith("mdl.") ? " \u2192 see: mm3 agent mdl" : "";
    this.stops.push({ cls: "schema", text: `\u2716 ${field}: ${problem} \u2192 ${fix}${mdlPointer}` });
  }
};
var MAX_QUESTION_CHARS = 160;
function lineProblem(v) {
  if (typeof v !== "string") return `${show2(v)} is not text`;
  if (v.includes("\n")) return "has a line break";
  if (len(v) < 3) return "is too short";
  if (len(v) > MAX_QUESTION_CHARS) return `is longer than ${MAX_QUESTION_CHARS} characters`;
  return void 0;
}
function checkTagKeys(o, field, what, out) {
  for (const k of Object.keys(o)) {
    if (!isTag(k)) out.add(`${field}.${k}`, `"${clip(k, 30)}" is not a ${what} name`, "use lowercase letters and digits, one word or kebab-case, \u2264 20 characters");
  }
}
function checkStringList(v, field, noun, min, max, out) {
  if (!Array.isArray(v)) return out.add(field, `${noun} must be a list`, `write [a, b]`);
  if (v.length < min || v.length > max) out.add(field, `${v.length} ${noun}`, `give ${min}\u2013${max}`);
  const bad = v.find((x) => typeof x !== "string");
  if (bad !== void 0) out.add(field, `${show2(bad)} is not text`, `quote it: "${String(bad)}"`);
  if (new Set(v.map((x) => JSON.stringify(x))).size !== v.length) out.add(field, `repeated ${noun}`, "make each one different");
}
function checkQuestion(v, n, out) {
  const field = `question ${n}`;
  if (typeof v === "string") {
    if (NOT_QUESTIONS.test(v.trim())) return out.add(field, "is not a question", "write it as text");
    const bad2 = lineProblem(v);
    if (bad2) return out.add(field, bad2, "ask one short thing on one line");
    if (!v.endsWith("?")) return out.add(field, `doesn't end in "?"`, "put it in quotes");
    return;
  }
  if (!isObj3(v)) return out.add(field, "is not a question", "write it as text");
  const kind = "scale" in v ? "scale" : "choice" in v ? "choice" : void 0;
  if (!kind || "scale" in v && "choice" in v) {
    return out.add(field, "is not a question", 'write "N: <question>?", or scale: + levels:, or choice: + options:');
  }
  const listKey = kind === "scale" ? "levels" : "options";
  for (const k of Object.keys(v)) {
    if (k !== kind && k !== listKey) out.add(field, `unknown key "${clip(k, 20)}"`, `a ${kind} has only ${kind}: and ${listKey}:`);
  }
  const bad = lineProblem(v[kind]);
  if (bad) out.add(field, `the ${kind} ${bad}`, "ask one short thing on one line");
  if (!(listKey in v)) return out.add(field, `a ${kind} needs ${listKey}:`, `add ${listKey}: [a, b]`);
  checkStringList(v[listKey], field, listKey, 2, kind === "scale" ? 10 : 8, out);
}
function checkCategory(v, field, out) {
  const pass = v.pass;
  const passOk = typeof pass === "boolean" || pass === "yes" || pass === "no" || Array.isArray(pass) && pass.length >= 1 && pass.every((x) => typeof x === "string");
  if (!passOk) out.add(`${field}.pass`, `${show2(pass)}`, "use yes, no, or a list of the passing levels or options");
  if ("need" in v && !["all", "most", "any"].includes(v.need)) out.add(`${field}.need`, `${show2(v.need)}`, "use all, most or any");
  if ("tags" in v) {
    const t = v.tags;
    if (!Array.isArray(t) || t.length > 3 || !t.every((x) => typeof x === "string" && isTag(x))) {
      out.add(`${field}.tags`, `${show2(t)}`, "give up to 3 tags, lowercase kebab-case, \u2264 20 characters");
    }
  }
  if ("family" in v && !FAMILIES.includes(v.family)) out.add(`${field}.family`, show2(v.family), `use ${list(FAMILIES)}`);
  for (const [k, q] of Object.entries(v)) {
    if (CATEGORY_KEYS.includes(k)) continue;
    if (!QNUM.test(k)) {
      out.add(`${field}.${clip(k, 20)}`, "not a question number or category key", /^0+$/u.test(k) ? "number questions from 1" : "a category holds pass, need, tags, family and numbered questions");
      continue;
    }
    checkQuestion(q, k, out);
  }
}
function checkCategoriesMap(categories, field, out) {
  if (!isObj3(categories)) return out.add(field, "is not a mapping", "give each category pass: and numbered questions");
  if (Object.keys(categories).length === 0) return out.add(field, "is empty", "add a category with pass: and numbered questions");
  checkTagKeys(categories, field, "category", out);
  for (const [name, c] of Object.entries(categories)) {
    const cfield = `${field}.${clip(name, 20)}`;
    if (!isObj3(c) || !("pass" in c)) out.add(cfield, "is not a category", "give it pass: and numbered questions");
    else checkCategory(c, cfield, out);
  }
}
function checkSectionsBlock(v, field, out) {
  for (const k of Object.keys(v)) {
    if (!SECTION_NAMES.includes(k)) out.add(`${field}.${clip(k, 20)}`, "not concerns or decisions", "use concerns: or decisions:");
  }
  if ("concerns" in v) checkCategoriesMap(v.concerns, `${field}.concerns`, out);
  if ("decisions" in v) checkCategoriesMap(v.decisions, `${field}.decisions`, out);
}
function checkAsk(ask2, verb, out) {
  const templateHint = `mm3 template ${verb ?? "<verb>"}`;
  if (!isObj3(ask2)) return out.add("mak.ask", "is not a mapping", `add concerns: and decisions: (${templateHint})`);
  if (Object.keys(ask2).length === 0) return out.add("mak.ask", "is empty", `add concerns: and decisions: (${templateHint})`);
  if ("concerns" in ask2 || "decisions" in ask2) {
    const layerKeys = Object.keys(ask2).filter((k) => !SECTION_NAMES.includes(k) && isObj3(ask2[k]));
    if (layerKeys.length > 0) {
      const many = layerKeys.length > 1;
      const names = layerKeys.map((k) => `${clip(k, 20)}:`).join(", ");
      for (const sec of SECTION_NAMES) {
        if (!(sec in ask2)) continue;
        out.add(
          `mak.ask.${sec}`,
          `sits beside the layer${many ? "s" : ""} ${names}`,
          many ? "move it under a layer (a sweep) or drop the layers (one subject)" : `move it under ${names} (a sweep) or drop ${names} (one subject)`
        );
      }
      for (const k of Object.keys(ask2)) {
        if (!SECTION_NAMES.includes(k) && !isObj3(ask2[k])) out.add(`mak.ask.${clip(k, 20)}`, "not concerns or decisions", "use concerns: or decisions:");
      }
      if ("concerns" in ask2) checkCategoriesMap(ask2.concerns, "mak.ask.concerns", out);
      if ("decisions" in ask2) checkCategoriesMap(ask2.decisions, "mak.ask.decisions", out);
      return;
    }
    checkSectionsBlock(ask2, "mak.ask", out);
    return;
  }
  const looksFlat = Object.values(ask2).some((v) => isObj3(v) && "pass" in v);
  if (looksFlat) return out.add("mak.ask", "put categories under concerns: (yes/no) and decisions: (scale/choice)", templateHint);
  checkTagKeys(ask2, "mak.ask", "layer", out);
  for (const [layer, v] of Object.entries(ask2)) {
    const field = `mak.ask.${clip(layer, 20)}`;
    if (layer === "concerns" || layer === "decisions") {
      out.add(field, '"concerns"/"decisions" are reserved for ask sections', "use a different layer name");
      continue;
    }
    if (!isObj3(v) || Object.keys(v).length === 0) {
      out.add(field, "is empty", "give it concerns: and/or decisions:");
      continue;
    }
    checkSectionsBlock(v, field, out);
  }
}
function checkOverShape(over, out) {
  if (!isObj3(over) || Object.keys(over).length === 0) return out.add("mak.over", "is not a mapping of layers", "write over: with a layer name and its items, e.g. part: [a, b]");
  checkTagKeys(over, "mak.over", "layer", out);
  for (const [layer, v] of Object.entries(over)) {
    if (layer === "concerns" || layer === "decisions") out.add(`mak.over.${layer}`, '"concerns"/"decisions" are reserved for ask sections', "use a different layer name");
    if (typeof v === "string") continue;
    if (!Array.isArray(v)) out.add(`mak.over.${clip(layer, 20)}`, "is not a list or a pattern", "write a list of items, a file pattern, or each");
    else if (v.length < 1 || v.length > 30) out.add(`mak.over.${clip(layer, 20)}`, `${v.length} items`, "give 1\u201330 items");
  }
}
function checkTouches(v, out) {
  if (!Array.isArray(v)) return out.add("mdl.touches", "must be a list", "write [a, b]");
  if (v.length > 5) out.add("mdl.touches", `${v.length} entries`, "give up to 5");
  v.forEach((x, i) => {
    if (typeof x !== "string" || x.includes("\n") || len(x) < 1 || len(x) > MAX_TOUCH_LEN) {
      out.add(`mdl.touches[${i}]`, show2(x), `each entry is 1\u2013${MAX_TOUCH_LEN} characters, one line`);
    }
  });
}
function checkUses(v, out) {
  const list3 = typeof v === "string" ? [v] : v;
  if (!Array.isArray(list3)) return void out.add("mdl.uses", show2(v), "write a level:name chain, e.g. container:api -> component:dao");
  if (list3.length < 1 || list3.length > 5) {
    out.add("mdl.uses", `${list3.length} chains`, "give 1\u20135");
    return void 0;
  }
  let ok2 = true;
  list3.forEach((x, i) => {
    const field = typeof v === "string" ? "mdl.uses" : `mdl.uses[${i}]`;
    if (typeof x !== "string") {
      out.add(field, show2(x), "write level:name, e.g. container:web-app");
      ok2 = false;
    } else if (len(x) > MAX_FREETEXT_LEN) {
      out.add(field, `is longer than ${MAX_FREETEXT_LEN} characters`, "shorten the chain");
      ok2 = false;
    } else if (!CHAIN_RE.test(x)) {
      out.add(field, show2(x), "write level:name, e.g. container:web-app");
      ok2 = false;
    }
  });
  return ok2 ? list3 : void 0;
}
function checkClosedSingle(field, v, out) {
  const allowed = closedValues(field);
  if (!allowed.includes(v)) out.add(`mdl.${field.key}`, show2(v), `use ${list(field.values)}`);
}
function checkClosedList(field, v, out) {
  const allowed = closedValues(field);
  if (Array.isArray(v) && (v.length < 1 || v.length > (field.maxList ?? Infinity))) {
    out.add(`mdl.${field.key}`, show2(v), `one value or a list of \u2264${field.maxList}: [${field.values.slice(0, field.maxList).join(", ")}]`);
    return;
  }
  const entries = Array.isArray(v) ? v : [v];
  const bad = entries.find((x) => !allowed.includes(x));
  if (bad !== void 0) out.add(`mdl.${field.key}`, show2(v), `use ${list(field.values)}, or a list of \u2264${field.maxList}`);
}
function checkMak(mak, verb, out) {
  if (!isObj3(mak)) return out.add("mak", "is not a mapping", "put goal: and the other fields under mak:");
  for (const k of Object.keys(mak)) {
    if (!MAK_KEYS.includes(k)) out.add(`mak.${clip(k, 20)}`, "not a field", `use ${list(MAK_KEYS)}`);
  }
  if (!("goal" in mak)) out.add("mak.goal", "missing", "add one line: what you want to be true");
  else {
    const bad = lineProblem(mak.goal);
    if (bad) out.add("mak.goal", bad, "write one line of 3\u2013160 characters: what you want to be true");
  }
  if ("depth" in mak && !DEPTHS.includes(mak.depth)) out.add("mak.depth", show2(mak.depth), `use ${list(DEPTHS)}`);
  if ("where" in mak) {
    const w = mak.where;
    if (!Array.isArray(w) || w.length < 1 || w.length > 5) out.add("mak.where", "needs 1\u20135 paths", "write where: [path/to/file.ts]");
    else for (const p of w) if (typeof p !== "string" || !PATH.test(p)) out.add("mak.where", `${show2(p)} is not a path`, "use a project path, optionally :start-end, with no spaces");
  }
  if ("parent" in mak && !(typeof mak.parent === "string" && RUN_ID2.test(mak.parent))) out.add("mak.parent", `${show2(mak.parent)} is not a run id`, "use MM3-####");
  if ("from" in mak && !(typeof mak.from === "string" && len(mak.from) >= 1 && len(mak.from) <= 200)) out.add("mak.from", show2(mak.from), "name an item id or a category of the parent run");
  if ("compare" in mak) {
    const c = mak.compare;
    const sides = isObj3(c) && Object.keys(c).every((k) => k === "before" || k === "after") ? c : void 0;
    const numeric = sides ? ["before", "after"].filter((k) => typeof sides[k] === "number") : [];
    for (const k of numeric) out.add(`mak.compare.${k}`, `${sides?.[k]} is a number`, `quote a hash of digits: ${k}: "${sides?.[k]}"`);
    const ok2 = sides !== void 0 && ["before", "after"].every((k) => typeof sides[k] === "string" || numeric.includes(k));
    if (!ok2) out.add("mak.compare", show2(c), "write compare: {before: main, after: HEAD}");
  }
  if ("expect" in mak) {
    const e = mak.expect;
    if (e === "none" || Array.isArray(e) && e.length === 0) {
    } else if (!Array.isArray(e) || e.length < 1 || e.length > 9 || !e.every((x) => typeof x === "string" && isTag(x))) {
      out.add("mak.expect", show2(e), 'give 1\u20139 concern names, lowercase kebab-case, \u2264 20 characters, or the word "none"');
    } else if (new Set(e).size !== e.length) {
      out.add("mak.expect", "repeated concern name", "make each one different");
    }
  }
  if ("verb" in mak && !VERBS.includes(mak.verb)) out.add("mak.verb", show2(mak.verb), `use ${list(VERBS)}, or leave it out`);
  if ("ask" in mak) checkAsk(mak.ask, verb, out);
  if ("over" in mak) checkOverShape(mak.over, out);
}
function checkMdlField(field, v, out) {
  if (field.literal) {
    checkCustomMdlValue(field.key, v, out);
    return;
  }
  switch (field.kind) {
    case "closed-single":
      checkClosedSingle(field, v, out);
      return;
    case "closed-list":
      checkClosedList(field, v, out);
      return;
    case "freetext": {
      const bad = lineProblem(v);
      if (bad) {
        out.add(`mdl.${field.key}`, bad, "write one line of 3\u2013160 characters: what you're solving now");
        return;
      }
      if (field.pattern !== void 0 && typeof v === "string") {
        let matches;
        try {
          matches = new RegExp(field.pattern, "u").test(v);
        } catch {
          matches = true;
        }
        if (!matches) out.add(`mdl.${field.key}`, show2(v), `must match the project's pattern for this field: ${field.pattern}`);
      }
      return;
    }
    case "chain-list":
      checkUses(v, out);
      return;
    case "freetext-list":
      checkTouches(v, out);
      return;
  }
}
function checkUnknownMdlKey(k, out, keys = MDL_KEYS) {
  out.add(`mdl.${clip(k, 20)}`, "not a field", `use ${list(keys)}, or a lower-kebab key \u2264${MAX_CUSTOM_KEY_LEN} characters`);
}
function checkCustomMdlValue(k, v, out) {
  if (Array.isArray(v) && (v.length < 1 || v.length > 5)) return out.add(`mdl.${k}`, `${v.length} entries`, "give 1\u20135");
  const entries = Array.isArray(v) ? v : [v];
  const bad = entries.find((x) => typeof x !== "string" || x.includes("\n") || len(x) > MAX_FREETEXT_LEN);
  if (bad !== void 0) out.add(`mdl.${k}`, show2(bad), `write one line \u2264${MAX_FREETEXT_LEN} characters, or a list of \u22645`);
}
function mdlBlockLineCount(rawText) {
  if (!rawText) return void 0;
  const lines = rawText.split(/\r?\n/u);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const start = lines.findIndex((l) => /^mdl\s*:/u.test(l));
  if (start === -1) return void 0;
  let count = 1;
  for (let i = start + 1; i < lines.length; i++) {
    const line3 = lines[i];
    if (line3.trim() !== "" && !/^\s/u.test(line3)) break;
    count++;
  }
  return count;
}
function checkMdl2(mdl2, out, rawText, mdlFields = MDL_FIELDS) {
  if (!isObj3(mdl2)) return out.add("mdl", "is not a mapping", "write why:, area: or parent: under mdl:, or leave mdl out");
  const byKey = new Map(mdlFields.map((f) => [f.key, f]));
  const byAlias = new Map(mdlFields.filter((f) => f.alias !== void 0).map((f) => [f.alias, f]));
  const isKnown = (k) => k === MDL_PARENT_KEY || byKey.has(k) || byAlias.has(k);
  const effectiveKeys = [...mdlFields.flatMap((f) => f.alias !== void 0 ? [f.key, f.alias] : [f.key]), MDL_PARENT_KEY];
  for (const k of Object.keys(mdl2)) if (!isKnown(k) && !isCustomKey(k)) checkUnknownMdlKey(k, out, effectiveKeys);
  for (const f of mdlFields) {
    const hasKey2 = f.key in mdl2;
    const hasAlias = f.alias !== void 0 && f.alias in mdl2;
    if (hasKey2 && hasAlias) {
      out.add(`mdl.${f.alias}`, `given alongside its own alias mdl.${f.key}`, `use one of mdl.${f.key} or mdl.${f.alias}, not both`);
    } else if (hasKey2) {
      checkMdlField(f, mdl2[f.key], out);
    } else if (hasAlias) {
      checkMdlField(f, mdl2[f.alias], out);
    }
  }
  if (MDL_PARENT_KEY in mdl2 && !(typeof mdl2[MDL_PARENT_KEY] === "string" && RUN_ID2.test(mdl2[MDL_PARENT_KEY]))) {
    out.add(`mdl.${MDL_PARENT_KEY}`, `${show2(mdl2[MDL_PARENT_KEY])} is not a run id`, "use MM3-####");
  }
  for (const [k, v] of Object.entries(mdl2)) if (!isKnown(k) && isCustomKey(k)) checkCustomMdlValue(k, v, out);
  const lineCount = mdlBlockLineCount(rawText);
  if (lineCount !== void 0 && lineCount > MAX_MDL_LINES) {
    out.add("mdl", `${lineCount} lines`, `the mdl block is capped at ${MAX_MDL_LINES} lines`);
  }
}
var RENAMED_BLOCKS = { side: "mak", wise: "mdl" };
function checkSchema(value, verb, rawText, mdlFields = MDL_FIELDS) {
  const out = new Out();
  if (!isObj3(value)) {
    out.add("request", "is not a mapping", "start with mak:");
    return out.stops;
  }
  for (const k of Object.keys(value)) {
    if (Object.hasOwn(RENAMED_BLOCKS, k)) out.add(k, "renamed", `use ${RENAMED_BLOCKS[k]}:`);
    else if (k !== "mak" && k !== "mdl") out.add(clip(k, 20), "not a block", "the request holds only mak: and mdl:; put fields under mak:");
  }
  if ("mak" in value) checkMak(value.mak, verb, out);
  else if (!("side" in value)) out.add("mak", "missing", "start with mak: and a goal");
  if ("mdl" in value) checkMdl2(value.mdl, out, rawText, mdlFields);
  return out.stops;
}

// src/help/rules.ts
var list2 = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}` : xs[0];
var RULES = [
  {
    // Plan 2b resolution: each concerns category's 3 probes plays a distinct role, named by the category's
    // family (given, or defaulted from the category name — see FAMILIES below); the role table itself (3 named
    // roles per family) is too wide for one dense-card bullet, so it lives in `mm3 agent probe`/`help
    // probe` (FAMILY_ROLES below, same file, one source) and the mm3-probe skill, both pointed at here.
    text: `depth: quick|standard|thorough = by default exactly ${DEPTH_COUNT.quick}, ${DEPTH_COUNT.standard} or ${DEPTH_COUNT.thorough} yes/no questions across 3k concerns categories (a project can change the counts: mm3 config), each with 3 probes in a distinct role \u2014 family: ${list2(FAMILIES)} (role table: mm3 agent probe) \u2014 a sweep: by default at most ${SWEEP_ITEM_CAP.quick}, ${SWEEP_ITEM_CAP.standard} or ${SWEEP_ITEM_CAP.thorough} items per layer`,
    in: ["card", "authoring", "class", "scan", "loop"]
  },
  { text: `where: at most 5 path entries \u2014 this is all the code a run sees`, in: ["card", "authoring", "class", "view"] },
  {
    // Round-4 finding: a cold agent hit `✖ question 1: is longer than 160 characters` with zero prior warning
    // in `agent view`/`agent probe` — this is MM3's own hard validator cap (schema-check.ts's
    // MAX_QUESTION_CHARS), not TypeSafe guidance, so it lives here rather than in PROBE_RULES below; tagged
    // 'probe' too so `agent probe`/`help probe` carry it alongside TypeSafe's own question-shape rules. [C-194]
    text: `a question (or the goal) is at most ${MAX_QUESTION_CHARS} characters, one line \u2014 longer text is rejected outright`,
    in: ["card", "authoring", "class", "scan", "drill", "loop", "view", "probe"]
  },
  { text: `pass: yes clears at >= 0.70; pass: no clears at <= 0.30; in between is unsure`, in: ["card", "verdict"] },
  { text: `every question in a category must point the same way as its pass:`, in: ["authoring"] },
  { text: `mdl.why is one of ${list2(WHYS)}`, in: ["mdl"] },
  { text: `mdl.area is one of ${list2(AREAS)}, single or a list of up to 2`, in: ["mdl"] },
  { text: `mdl.stage is one of ${list2(STAGES)}`, in: ["mdl"] },
  { text: `mdl.change is one of ${list2(CHANGES)}`, in: ["mdl"] },
  { text: `mdl.risk is one of ${list2(RISKS)}`, in: ["mdl"] },
  { text: `every closed mdl field also accepts "${UNKNOWN_VALUE}"`, in: ["mdl"] },
  { text: `the mdl block is capped at ${MAX_MDL_LINES} YAML lines`, in: ["mdl"] },
  { text: `decisions: ${DECISIONS_MIN}\u2013${DECISIONS_MAX} categories, scale or choice only, at least one scale and one choice`, in: ["authoring"] },
  { text: "questions are numbered 1\u2026N across the whole request, decisions included", in: ["card", "authoring", "class", "scan", "drill", "loop"] }
];
function ruleLines(tag) {
  return RULES.filter((r) => r.in.includes(tag)).map((r) => `- ${r.text}.`);
}
var FAMILY_ROLES = [
  { family: "injection", roles: ["reach", "guard", "sink"] },
  { family: "access", roles: ["actor", "check", "resource"] },
  { family: "secrets", roles: ["store", "transport", "exposure"] },
  { family: "input", roles: ["source", "validate", "reject"] },
  { family: "output", roles: ["source", "encode", "render"] },
  { family: "availability", roles: ["trigger", "limit", "recovery"] },
  { family: "correctness", roles: ["input", "rule", "result"] },
  { family: "design", roles: ["responsibility", "dependency", "testability"] },
  { family: "design-risk", roles: ["abuse", "failure", "data"] },
  { family: "done", roles: ["concrete", "testable", "owned"] }
];
var BAD_PROBE_EXAMPLE = {
  bad: "Is this method secure?",
  why: "a yes means nothing: no mechanism, no angle, no place",
  good: [
    "Is `id` from `req.query` concatenated into the SQL string? (reach)",
    "Is `id` bound as a parameter instead? (guard)",
    "Does the query run with `db.query` on that string? (sink)"
  ]
};
var PROBE_RULES = [
  {
    text: "One narrow judgment per question \u2014 break a complex or ill-defined question into separate questions that each evaluate one property.",
    cite: "concepts/how-to-build-with-system-one.md"
  },
  {
    text: "The question carries its full meaning on its own \u2014 a question's number is a label for the response only; the model never sees it.",
    cite: "concepts/how-to-build-with-system-one.md"
  },
  {
    text: "It's answerable from the code in where: \u2014 name the file in backticks inside the sentence when there's more than one (a value that starts with a backtick must be in quotes), and send only the context the question needs.",
    cite: "concepts/how-to-build-with-system-one.md"
  },
  {
    text: 'Yes/no questions keep one polarity per category \u2014 phrase so "yes" is the affirmative you mean, not an inverted "is free of\u2026".',
    cite: "primitives/noul.md"
  },
  {
    text: "Scale levels describe concrete situations, not relative points \u2014 every level is judged on its own; the model sees neither its number nor its neighbours.",
    cite: "primitives/score.md"
  },
  {
    text: 'Choice options include a "none fits" outcome for when nothing else matches.',
    cite: "primitives/choice.md"
  },
  {
    text: 'Phrase the goal as the safe state ("X rejects Y"), not the vulnerability ("X runs input as code") \u2014 a goal is asked as a yes/no, so the same affirmative-alignment rule applies to it.',
    cite: "primitives/noul.md"
  },
  {
    text: 'Add the visible-scope probe as a recommended extra question: "Can this be answered from the code shown?"',
    cite: "concepts/how-to-build-with-system-one.md"
  }
];
var VERDICT_FACTS = [
  "`need:` on a category: `all` (default, every answer clears the bar) \xB7 `most` (>= 2/3 clear, none a clear miss) \xB7 `any` (at least one clears)",
  "the gate passes only when the goal and every category pass; in a sweep, an item passes only when its own categories and every child does too",
  "`consensus` (STRONG \xB7 SPLIT \xB7 WEAK): whether the yes/no answers agree with each other \u2014 shown on `class`, and `drill` on a one-subject parent; a sweep or `replay` response never computes it",
  "`escalate: true` on non-STRONG consensus, `depth: thorough`, or a goal that reads as irreversible (delete, deploy, drop, pay, migrate, secret, credential) \u2014 don't act on this alone",
  "a probability near 0.50 means the evidence points both ways about equally, not a medium-strength yes \u2014 that's exactly why it lands in `unsure` rather than a weak pass",
  "the answer's shape is guaranteed (a number in range, a level that's really one of yours) \u2014 whether it's the RIGHT number is what consensus, escalate and your own reading are for, not the schema",
  "`replay`'s per-category grade: `fixed` (failed or unsure before, passes now), `still` (failed or unsure before, still doesn't), `regressed` (passed before, not any more \u2014 regressed alone fails the gate even when every `after` category passes)",
  "`reused: [MM3-####]` names prior runs an answer's evidence and question text matched exactly \u2014 free, not a new call",
  "the cache returns old answers to old questions; learning comes from new ones",
  "`mm3 report hits` flags a one-subject answer `stale` once the code at its own `where` has changed since \u2014 re-run it rather than trust it",
  "a run can fail to answer for different reasons, and the exit code says which: a bad request never reaches the classifier (exit 2); a provider or ledger problem does (exit 1); a blocked budget never spends at all (exit 3) \u2014 read which one you got before treating a stop as `unsure`",
  "a stop always reads `\u2716 field: problem \u2192 fix`; run `mm3 help <verb>` when one doesn't make sense"
];

// src/help/verbs.ts
var EXAMPLES2 = {
  view: "mm3 view src/handlers          # what does the ledger already know about this folder?\nmm3 view MM3-0042               # this run's own lineage, up and down",
  class: [
    "mak:",
    "  goal: This login handler is safe to merge   # phrase as the exact claim to prove",
    "  depth: quick                                # => exactly 10 yes/no below",
    "  where: [src/user.ts:1-3]                     # include the wiring, not just the handler",
    "  ask:",
    "    injection: {pass: no, 1: Is request text put into a query unvalidated?, ...}",
    "mdl: {why: validate, area: auth}"
  ].join("\n"),
  replay: "mak:\n  goal: The injection fix works\n  parent: MM3-0042\n  compare: {before: main, after: HEAD}",
  scan: [
    "mak:",
    "  goal: Handlers don't trust request input",
    "  depth: quick",
    "  over: {file: src/handlers/*.ts, function: each}     # scan by file when the file itself is the unit",
    "  ask:",
    "    function:",
    "      injection: {pass: no, 1: Does {function} put request text straight into a query?}"
  ].join("\n"),
  drill: "mm3 template drill --parent MM3-0060 --from src/handlers/user.ts/findUser   # follow next:, don't hand-author the ids",
  loop: [
    "mak:",
    "  goal: The checkout redesign is sound",
    "  depth: quick",
    "  over:",
    "    part:                              # part and story are SIBLINGS, both under over:",
    "      - name: gateway",
    "        story: [guest checkout, saved cards]",
    "  ask:",
    "    story:",
    '      done: {pass: yes, 1: Is "{story}" testable against {part} as written?}   # asked of EVERY story'
  ].join("\n")
};
var SHARP = {
  view: ['a code file (not a request) is a place, not a request \u2014 view <folder>, ".", a tag, or MM3-#### all work'],
  class: ["goal wording changes the verdict (that's a feature, not a bug) \u2014 phrase it as the claim you need proven"],
  replay: [
    'the files must be committed at the ref you name (or use "worktree" for the working tree) \u2014 replay runs git in the repo that actually holds them',
    "replay re-runs the parent's own questions; it never takes ask: (use class for new questions)",
    `a sweep parent (scan, loop, drill's sweep form) is replayed too: it re-sweeps at both refs and reports fixed/still/regressed per item \u2014 only a drill sweep CONTINUATION (over: starting with "each") is refused`
  ],
  scan: ["add a scale question to a layer to rank findings by severity, worst first, instead of an unordered map", "scan by file when the file itself is the unit that matters, not a function inside it"],
  drill: ["follow the `next:` line rather than hand-authoring parent/from \u2014 it already names the id and the category or item"],
  loop: [
    "a sub-layer (like story under part) is a SIBLING key under over:, never nested inside its parent item",
    'a story/part name is one word or kebab-case, at most 20 characters, and never contains "/"',
    "every question under a layer is asked of every item at that layer \u2014 phrase it so that holds for all of them"
  ]
};
var PURPOSE = {
  view: "MAK\xB3 x Know: what do we already know here? Free \u2014 it reads the ledger and never calls out.",
  class: "MAK\xB3 x Judge: does the evidence support this one goal? One call, one subject.",
  replay: "MAK\xB3 x Prove: did the change work? It replays a parent run's questions on two states.",
  scan: "MDL\xB3 x Know: where in this code should we look? A sweep across code, read by us.",
  drill: "MDL\xB3 x Judge: why did this one thing fail? It goes down from one item in a parent run.",
  loop: "MDL\xB3 x Prove: does this idea hold up? A sweep across layers of ideas the agent writes."
};
var WHEN = {
  view: "before any paid call, when entering unfamiliar code, or to find proven questions.",
  class: "a decision on one subject: merge, choose, triage, check a fix.",
  replay: "after a fix, a refactor, a dependency bump, or to compare fix A with fix B.",
  scan: "a new codebase, a release check, a PR's changed files, or a vague bug with no location yet.",
  drill: "after a fail or unsure from class, scan, loop or replay.",
  loop: "a design, a plan or a feature request before any code exists."
};
var VERB_LINE = {
  view: "free; what's already known for a request you wrote (mm3 view <request-file>), before any paid call",
  class: "one decision on one thing (merge, choose, triage, check a fix)",
  replay: "re-check a run's questions across two git refs: after a fix, or what changed between releases or commits",
  scan: "sweep many files when the problem's location is unknown",
  drill: "go down from one flagged item of an earlier run",
  loop: "check a design or plan before code exists"
};
function verbHelp(verb) {
  return [
    `Agents: mm3 agent ${verb}`,
    `## ${verb}`,
    PURPOSE[verb],
    `When: ${WHEN[verb]}`,
    "",
    "Example:",
    EXAMPLES2[verb],
    "",
    "Sharp rules:",
    ...SHARP[verb].map((s) => `- ${s}.`),
    ...ruleLines(verb),
    ...proseLines(verb)
  ].join("\n");
}

// src/help/agent.ts
var isVerb = (s) => VERBS.includes(s);
function renderCard(id, rules, patterns = [], run = []) {
  return [...id, "rules:", ...rules, ...patterns, ...run].join("\n");
}
var AGENT_TOOLS = ["report", "outcome", "budget", "template"];
function noKeyRunLine(env, deps) {
  let config;
  try {
    config = resolveJevConfig(env, deps);
  } catch {
    return [];
  }
  if (hasKey(config)) return [];
  return [inPluginContext(env) ? `run: no key (sample answers only) \u2192 ${NO_KEY_PLUGIN_HINT}` : "run: no key \u2192 mm3 init to add one"];
}
var PROJECT_SCOPE_RULE = "- where: resolves against the MCP `project` argument or, in a terminal, the project folder (the nearest .mm3 or .git above where you run mm3): run mm3 from inside the project; a session cwd outside it needs `project` (MCP) or MM3_HOME (CLI) set in the environment, never typed as a prefix on the command.";
var PROBE_SKILL_RULE = "- before writing or editing any request, read the mm3-probe skill (or run `mm3 agent probe`): what makes a probe worth asking.";
var CHAIN_RULES = [
  "- open goal, in order: view (free reuse) \u2192 scan (find where) \u2192 drill (go deeper on a flagged item; follow next:) \u2192 loop (check the design) \u2192 replay (after a change).",
  "- what changed or drifted between releases or commits: replay a prior run with compare: {before: <ref>, after: <ref>} (no prior run: class or scan once at one ref first); git diff is not an mm3 check."
];
var EVIDENCE_RULES = [
  "- every number or claim you report comes from an mm3 answer (cite its id, e.g. MM3-0042) or is labelled your own estimate.",
  "- a check done without mm3 (git diff, reading code to answer a question) is a workaround: say so; never claim none.",
  "- notes: budget: \u2026 left is headroom, not a limit: stop only at \u26A0 or exit 3, then tell the owner."
];
var SEND_RULE = "- sending a request: start from `mm3 template <verb>`, save it with your file-write tool (not a shell heredoc or a chain of commands), then run one plain `mm3 <verb> <file> --dry-run` and then `mm3 <verb> <file>`; through MCP the YAML goes in `stdin`.";
function overview(env, deps) {
  return renderCard(
    [
      "verbs (pick by goal):",
      ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
      "tools:",
      ...AGENT_TOOLS.map((t) => `- ${t}: ${TOOL_LINE[t]}`)
    ],
    [PROBE_SKILL_RULE, ...ruleLines("card"), PROJECT_SCOPE_RULE, SEND_RULE, ...CHAIN_RULES, ...EVIDENCE_RULES],
    [],
    [
      "run: mm3 agent <verb|tool> \u2014 before writing that request",
      "run: mm3 agent probe \u2014 before writing questions: how to phrase one",
      "run: mm3 agent verdict \u2014 before reading a response: how to read it",
      "run: mm3 agent delegate \u2014 before handing MM3 work to a helper agent: what to paste into its prompt",
      "run: mm3 init --agents --yes \u2014 to set this project up for agents: writes the MM3 guidance into AGENTS.md (alone, not with mm3 init)",
      ...noKeyRunLine(env, deps)
    ]
  );
}
function verbCard(verb) {
  return renderCard([`verb: ${verb}`], [...SHARP[verb].map((s) => `- ${s}.`), ...ruleLines(verb)], terseLines(verb));
}
function probeCard() {
  return renderCard(
    ["tool: probe"],
    [
      ...PROBE_RULES.map((r) => `- ${r.text}`),
      ...ruleLines("probe"),
      ...FAMILY_ROLES.map((f) => `- ${f.family}: ${f.roles.join(" \xB7 ")}`),
      `- bad: "${BAD_PROBE_EXAMPLE.bad}" \u2014 ${BAD_PROBE_EXAMPLE.why}`,
      ...BAD_PROBE_EXAMPLE.good.map((g) => `- good: ${g}`),
      "- see: the mm3-probe skill for the full model and worked examples"
    ]
  );
}
function verdictCard() {
  return renderCard(["tool: verdict"], [...ruleLines("verdict"), ...VERDICT_FACTS.map((f) => `- ${f}`)]);
}
function outcomeCard() {
  return renderCard(
    ["tool: outcome"],
    [
      "- syntax: mm3 outcome <MM3-####> held|overruled|failed --by <actor>",
      "- no --note flag: keep a reason in your own notes, not here",
      "- an actor can't mark its own asked run held: use a different --by, or record overruled or failed",
      "- same outcome, same actor, twice: exit 0, no-op"
    ],
    [
      "patterns:",
      "- why: held needs a second actor; never self-certify",
      "  bad:",
      "    mm3 outcome MM3-0002 held --by claude",
      "  good:",
      "    mm3 outcome MM3-0002 held --by <the user or a reviewer agent, not you>"
    ]
  );
}
function budgetCard() {
  return renderCard(
    ["tool: budget"],
    [
      "- read-only: prints what is left and how to change it",
      "- the caps live in .mm3/config.yaml: budget.usd, budget.runs (and budget.per, budget.since, budget.warnAt)",
      "- change one, then run mm3 config --load: a changed budget restarts the count",
      "- over either cap: exit 3, before spending anything"
    ],
    [
      "patterns:",
      "- why: `budget set` and `budget reset` were removed, the config is the one place to change it",
      "  bad:",
      "    mm3 budget set --usd 5 --runs 500",
      "  good:",
      "    # edit budget.usd / budget.runs in .mm3/config.yaml, then:",
      "    mm3 config --load"
    ]
  );
}
function doctorCard() {
  return renderCard(
    ["tool: doctor"],
    [
      "- syntax: mm3 doctor  \xB7  or: mm3 doctor <file | ->",
      "- free: no call, no spend, never writes",
      "- bare form: reports provider/route/key/project/node/config in one pass \u2014 also validates .mm3/config.yaml when present",
      "- <file|-> form: checks ONE document, no project needed \u2014 a mak: key means a request (same checks as --dry-run); anything else is checked as config",
      "- <file|-> never touches the ledger, reuse or budget, even inside a project"
    ]
  );
}
function reportCard() {
  return renderCard(
    ["tool: report"],
    [
      "- free: never calls a provider, never writes to the ledger",
      "- views: hits (default), patterns, history, web, graph, problems, mdl, calls, fields",
      "- web writes one file, .mm3/viewer.html, and tries to open it \u2014 the only view that writes anything",
      "- graph/problems/mdl/calls read the graph tier (its own watermark, refreshed on read, never on a paid call)",
      "- fields: undeclared mdl keys with counts/samples/a suggested type; --accept <field> writes it into config mdl:"
    ],
    [
      "patterns:",
      "- why: no view beyond hits, patterns, history, web, graph, problems, mdl, calls or fields exists",
      "  bad:",
      "    mm3 report level2",
      "  good:",
      "    mm3 report patterns"
    ]
  );
}
function templateCard() {
  return renderCard(
    ["tool: template"],
    [
      "- syntax: mm3 template <verb> [--parent MM3-#### --from <item-or-category>]",
      "- or: mm3 template <verb> --from <request.yaml> [--where <path>]... [--goal <text>]",
      "- free: no project needed, never spends, never writes",
      "- --parent only applies to drill, and needs --from too",
      "- --where/--goal need --from; refused together with --parent"
    ],
    [
      "patterns:",
      "- why: --parent only works with drill",
      "  bad:",
      "    mm3 template class --parent MM3-0002 --from injection",
      "  good:",
      "    mm3 template drill --parent MM3-0002 --from injection"
    ]
  );
}
function configCard() {
  return renderCard(
    ["tool: config"],
    [
      "- syntax: mm3 config [--write | --load [file]]",
      "- free: plain config never writes, never spends, works with or without a project",
      "- prints every effective setting (budget, provider, baseURL, model, pricing, timeoutMs, retries, backoffMs, sweep, requestMaxBytes, reuse, depth, evidence, lens, mdl) and which of default/config/env it came from",
      "- .mm3/config.yaml IS the config: every request reads it, so an edit applies at once and deleting the file means defaults",
      "- to return to the defaults, delete .mm3/config.yaml, then run mm3 config --load (it records the change); do not guess old values",
      "- mm3 config --load [file] checks the file (a named file is copied to .mm3/config.yaml as is) and records a receipt in the ledger: \u2714 valid \xB7 loaded \xB7 N changed since the last load, or every \u2716 problem and nothing recorded",
      "- doctor and mm3 config compare the file with the latest receipt: \u2714 config: loaded <time>, or \u26A0 config.yaml is in effect but its latest change is not recorded \u2192 mm3 config --load",
      "- a changed budget (usd, runs, per) restarts the count when loaded; the receipt says so",
      "- a config.yaml with a problem stops paid runs (class, scan, drill, loop, replay) with every \u2716 and the fix; reads still answer",
      "- sparse overrides only, precedence env > config > default",
      "- the display is not a file: to customize run mm3 config --write \u2192 writes .mm3/config.yaml (commented guide) only if missing, never overwrites",
      "- a misnamed .mm3/config.ymal (or config.yml, config.json) gets a did-you-mean note here and in doctor"
    ]
  );
}
function delegateCard() {
  return renderCard(
    ["tool: delegate"],
    [
      "- paste this card into the prompt of every helper you hand MM3 work to",
      "- use only the `mm3` MCP tool, never the shell (there is no mm3 command on PATH), one request at a time; never read .mm3/log.jsonl",
      '- write each request by editing the output of `mm3 template <verb>`, not from scratch; quote any question that holds ": " or " #"; a verb that stops with \u2716 says the fix, apply it and resend',
      "- report each MM3 run id with its gate, and say what you did NOT run; the lead checks the ids against the ledger before relying on the report",
      "- start with one small request, then the batch; a helper that stops early or says it finished is checked, not trusted",
      ...GUIDANCE_BODY
    ]
  );
}
var BLAST_CARD_ORDER = ["person", "system", "container", "component", "code"];
function noteWithAlias(field) {
  return field.alias ? `${field.note ?? ""}${field.note ? " " : ""}(also: mdl.${field.alias})` : field.note ?? "";
}
function mdlCard(mdlFields = MDL_FIELDS) {
  const [why, area, stage, change, risk, problem, uses, blast, touches] = mdlFields;
  const blastValues = blast.values === BLASTS ? BLAST_CARD_ORDER : closedValues(blast).slice(0, -1);
  return [
    `tool: mdl \u2014 optional, free, \u2264${MAX_MDL_LINES} lines. Flat keys; the only nesting is a list.`,
    "Every field is optional: fill what you know, omit what doesn't apply.",
    "",
    "FIELDS",
    `  why      ${closedValues(why).slice(0, -1).join(" | ")}${why.alias ? `  (also: mdl.${why.alias})` : ""}`,
    `  area     ${closedValues(area).slice(0, -1).join(" | ")}          (list \u2264${area.maxList}; ${noteWithAlias(area)})`,
    `  stage    ${closedValues(stage).slice(0, -1).join(" | ")}   (${noteWithAlias(stage)})`,
    `  change   ${closedValues(change).slice(0, -1).join(" | ")}   (${noteWithAlias(change)})`,
    `  risk     ${closedValues(risk).slice(0, -1).join(" | ")}         ${noteWithAlias(risk)}`,
    `  problem  ${noteWithAlias(problem)}`,
    `  uses     ${noteWithAlias(uses)}`,
    `  blast    ${blastValues.join(" | ")}   ${noteWithAlias(blast)}`,
    `  touches  ${noteWithAlias(touches)}`,
    `  <other>  any kebab-case key: one line \u2264160 or a list \u22645, recorded as-is`,
    `  ${UNKNOWN_VALUE}  allowed as a value for any closed field`,
    "",
    "ARCHITECTURE: the C4 model (c4model.com). Five levels, each inside the one above:",
    "",
    "  system: shop",
    "  \u2514\u2500\u2500 container: web-app                      an app or data store",
    "  \u2502   \u251C\u2500\u2500 component: orders-handler           a group of code inside a container",
    "  \u2502   \u2502   \u2514\u2500\u2500 code: createOrder               your own function (not a built-in)",
    "  \u2502   \u2514\u2500\u2500 component: orders-dao",
    "  \u2514\u2500\u2500 container: database",
    "  person: customer                             outside the system",
    "  system: payment-service                      an outside service is its own system",
    "",
    "WRITE IT FLAT",
    "  inside  \u2192  parent/child in the name:  component:web-app/orders-handler",
    "  uses    \u2192  ->  between parts:         a -> b -> c",
    "  guessed or not built yet  \u2192  end any part with ?:  component:web-app/refunds?  system:email-service?",
    "",
    '  chain   :=  part ( " -> " part )*',
    '  part    :=  level ":" name ( "/" name )* [ "?" ]',
    `  level   :=  ${CHAIN_LEVELS.join(" | ")}`,
    "  name    :=  lowercase kebab-case, or a code identifier at the code level",
    "",
    "EXAMPLE",
    "  mdl:",
    "    why: validate",
    "    problem: request input reaches a raw query in order creation",
    "    uses:",
    "      - person:customer -> container:web-app",
    "      - component:web-app/orders-handler -> component:web-app/orders-dao -> container:database",
    "    blast: container",
    "    touches: [Order, amount]"
  ].join("\n");
}
var AGENT_TOPICS = {
  probe: probeCard,
  verdict: verdictCard,
  outcome: outcomeCard,
  budget: budgetCard,
  report: reportCard,
  template: templateCard,
  mdl: mdlCard,
  config: configCard,
  doctor: doctorCard,
  delegate: delegateCard
};
var agentExtras = () => Object.keys(AGENT_TOPICS);
var AGENT_EXTRAS = Object.keys(AGENT_TOPICS);
var agentTopicFor = (command) => command !== void 0 && (isVerb(command) || Object.hasOwn(AGENT_TOPICS, command)) ? command : void 0;
var POINTER_LINE = /^→ see: mm3 agent( \S+)?$/;
function endWithAgentPointer(text, command) {
  const body = text.trimEnd();
  const last = body.slice(body.lastIndexOf("\n") + 1);
  if (POINTER_LINE.test(last)) return text;
  const topic = agentTopicFor(command);
  return `${body}
\u2192 see: mm3 agent${topic ? ` ${topic}` : ""}${text.endsWith("\n") ? "\n" : ""}`;
}
function runAgent(target, env = {}, deps = {}) {
  if (target === void 0 || target === "") return { exit: 0, text: overview(env, deps) };
  if (hasControlChars(target)) return { exit: 2, text: "\u2716 agent: the target has control characters \u2192 use a verb name" };
  if (isVerb(target)) return { exit: 0, text: verbCard(target) };
  if (target === "mdl" && deps.paths) return { exit: 0, text: mdlCard(effectiveMdlFields(resolveConfig(deps.paths, env).config.mdl)) };
  if (Object.hasOwn(AGENT_TOPICS, target)) return { exit: 0, text: AGENT_TOPICS[target]() };
  return { exit: 2, text: `\u2716 agent: "${clip(target, 40)}" is not a verb \u2192 one of ${VERBS.join(", ")}, or ${agentExtras().map((t) => `"${t}"`).join(", ")}` };
}

// src/mcp/protocol.ts
var SUPPORTED_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
var DEFAULT_VERSION = "2025-06-18";
var TOOL_NAME = "mm3";
var TOOL_FIELDS = ["args", "stdin", "project"];
function toolDefinition() {
  return {
    name: TOOL_NAME,
    description: 'Quick, citable evidence for judgment calls on code or a design (safe to merge? is it fixed? which option?). First call args: ["agent"] to learn the commands and rules, then args: ["agent", "<command>"] before writing a request. Otherwise runs any mm3 CLI command in this project \u2014 the same arguments and stdin the mm3 CLI takes (e.g. args: ["class","-"], stdin: <request YAML>, or args: ["doctor"]). Returns the same text output mm3 would print, and marks the result an error when the exit code is not 0.',
    inputSchema: {
      type: "object",
      properties: {
        args: { type: "array", items: { type: "string" }, description: 'mm3 CLI arguments, e.g. ["doctor"] or ["class","-"]' },
        stdin: { type: "string", description: 'Text to feed as stdin, for a "-" argument (e.g. the request YAML).' },
        project: { type: "string", description: "The project directory to use (MM3_HOME), when it is not the current working directory." }
      },
      required: ["args"]
    }
  };
}
var err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
var ok = (id, result) => ({ jsonrpc: "2.0", id, result });
var rpcStop = (what, fix) => endWithAgentPointer(`\u2716 mcp: ${what} \u2192 ${fix}`);
var toolStop = (id, text, args2) => ok(id, { content: [{ type: "text", text: endWithAgentPointer(text, args2?.[0]) }], isError: true });
var ignoredHint = (ignored) => `\u2716 arguments: ignored ${ignored.map((k) => `"${clip(k, 40)}"`).join(", ")} \u2192 the tool takes only args, stdin and project: the request YAML goes in "stdin" (args: ["class","-"])`;
function withHintBeforePointer(text, hint) {
  const lines = text.trimEnd().split("\n");
  const pointer = lines.at(-1)?.startsWith("\u2192 see: mm3 agent") ? lines.pop() : void 0;
  return [...lines, "", hint, ...pointer === void 0 ? [] : [pointer]].join("\n");
}
async function handleMessage(msg, deps) {
  const hasId = Object.hasOwn(msg, "id") && msg.id !== void 0;
  if (!hasId) return void 0;
  const id = msg.id;
  const method = typeof msg.method === "string" ? msg.method : void 0;
  if (!method || msg.jsonrpc !== "2.0") return err(id, -32600, rpcStop('Invalid Request (jsonrpc is not "2.0")', 'send {"jsonrpc":"2.0","id":\u2026,"method":\u2026}'));
  if (method === "initialize") {
    const params = msg.params ?? {};
    const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : void 0;
    const protocolVersion = requested && SUPPORTED_VERSIONS.includes(requested) ? requested : DEFAULT_VERSION;
    return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "mm3", version: deps.serverVersion }, instructions: MM3_GUIDANCE });
  }
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: [toolDefinition()] });
  if (method === "tools/call") {
    const params = msg.params ?? {};
    if (params.name !== TOOL_NAME) return err(id, -32602, rpcStop(`Unknown tool "${clip(String(params.name), 40)}"`, `call the one tool, named "${TOOL_NAME}"`));
    const given = params.arguments ?? {};
    const rawArgs = given.args;
    if (rawArgs !== void 0 && !Array.isArray(rawArgs)) {
      return toolStop(id, `\u2716 args: must be an array of strings, got ${typeof rawArgs} \u2192 args: ["class","-"] and the request YAML as the separate field stdin`);
    }
    const args2 = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
    if (given.stdin !== void 0 && typeof given.stdin !== "string") {
      return toolStop(id, `\u2716 stdin: must be text, got ${given.stdin === null ? "null" : Array.isArray(given.stdin) ? "array" : typeof given.stdin} \u2192 send the request YAML as one string in stdin`, args2);
    }
    const stdin = typeof given.stdin === "string" ? given.stdin : void 0;
    const project = typeof given.project === "string" ? given.project : void 0;
    const ignored = Object.keys(given).filter((k) => !TOOL_FIELDS.includes(k));
    if (ignored.length > 0 && args2.includes("-") && !stdin?.trim()) return toolStop(id, ignoredHint(ignored), args2);
    try {
      const { exit, text } = await deps.runOne(args2, stdin, project);
      const shown2 = exit !== 0 && ignored.length > 0 ? withHintBeforePointer(text, ignoredHint(ignored)) : text;
      return ok(id, { content: [{ type: "text", text: exit !== 0 ? endWithAgentPointer(shown2, args2[0]) : shown2 }], isError: exit !== 0 });
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
      return toolStop(id, `\u2716 mm3: ${message} \u2192 retry; if it repeats, report it with the command you ran`, args2);
    }
  }
  return err(id, -32601, rpcStop(`Method not found: ${clip(method, 40)}`, "use initialize, ping, tools/list or tools/call"));
}

// src/mcp/stdio.ts
function runMcpServer(io, runOne, serverVersion) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: io.input, terminal: false });
    rl.on("line", (line3) => {
      const trimmed = line3.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        io.output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: rpcStop("Parse error (the line is not JSON)", "send one JSON-RPC 2.0 message per line") } })}
`);
        return;
      }
      handleMessage(msg, { runOne, serverVersion }).then((response) => {
        if (response) io.output.write(`${JSON.stringify(response)}
`);
      }).catch(() => {
        const id = msg.id ?? null;
        io.output.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: rpcStop("Internal error", "retry; if it repeats, report it with the call you sent") } })}
`);
      });
    });
    rl.on("close", () => resolve());
  });
}

// src/setup/env-file.ts
import { chmodSync, closeSync as closeSync4, fchmodSync, fstatSync as fstatSync4, mkdirSync as mkdirSync4, openSync as openSync4, readFileSync as readFileSync10, rmSync as rmSync3, writeFileSync as writeFileSync5 } from "node:fs";
import os2 from "node:os";
import path7 from "node:path";
var ALLOWED_NAMES = ["TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "TYPESAFE_BASE_URL", "JEV_MODEL", "JEV_GATEWAY_MODEL", "MM3_PROVIDER"];
var isAllowedName = (s) => ALLOWED_NAMES.includes(s);
var EXPORT_LINE = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)='([^']*)'\s*$/u;
function mm3ConfigDir(env = process.env) {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  return xdg ? path7.join(xdg, "mm3") : path7.join(os2.homedir(), ".config", "mm3");
}
function envFilePath(env = process.env) {
  return path7.join(mm3ConfigDir(env), "env");
}
function readEnvFile(file) {
  let mode;
  let raw;
  let fd;
  try {
    fd = openSync4(file, "r");
    mode = fstatSync4(fd).mode & 511;
    raw = readFileSync10(fd, "utf8");
  } catch {
    return void 0;
  } finally {
    if (fd !== void 0) closeSync4(fd);
  }
  const values = {};
  let ignoredLines = 0;
  for (const line3 of raw.split("\n")) {
    const trimmed = line3.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && isAllowedName(m2[1])) {
      values[m2[1]] = m2[2];
    } else {
      ignoredLines++;
    }
  }
  return { values, mode, ignoredLines };
}
var canQuote = (value) => !value.includes("'");
function readLines(file) {
  try {
    return readFileSync10(file, "utf8").split("\n");
  } catch (e) {
    if (isAbsent(e)) return void 0;
    throw e;
  }
}
function writeSecret(file, text) {
  const fd = openSync4(file, "w", 384);
  try {
    fchmodSync(fd, 384);
    writeFileSync5(fd, text);
  } finally {
    closeSync4(fd);
  }
}
function setEnvFileValue(file, name, value) {
  if (!canQuote(value)) throw new Error(`env-file: "${name}"'s value contains a single quote, which this file format can't represent`);
  const dir = path7.dirname(file);
  mkdirSync4(dir, { recursive: true });
  chmodSync(dir, 448);
  const existing = readLines(file) ?? [];
  const newLine = `export ${name}='${value}'`;
  let replaced = false;
  const next = existing.map((line3) => {
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && m2[1] === name) {
      replaced = true;
      return newLine;
    }
    return line3;
  });
  if (!replaced) next.push(newLine);
  writeSecret(file, `${next.join("\n").replace(/\n+$/u, "")}
`);
}
function removeEnvFileValue(file, name) {
  const lines = readLines(file);
  if (lines === void 0) return "absent";
  let found = false;
  const next = lines.filter((line3) => {
    const m2 = EXPORT_LINE.exec(line3);
    if (m2 && m2[1] === name) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) return "absent";
  if (next.join("\n").trim() === "") {
    rmSync3(file, { force: true });
    return "file-removed";
  }
  writeSecret(file, `${next.join("\n").replace(/\n+$/u, "")}
`);
  return "removed";
}
function looseFileModeWarning(file, mode) {
  if ((mode & 63) === 0) return void 0;
  return `\u2716 credentials: ${file} is mode ${mode.toString(8)}, looser than 0600 \u2192 chmod 600 ${file}`;
}

// src/setup/keychain.ts
var TIMEOUT_MS = 3e3;
var cleanLine = (s) => s.replace(/\r?\n+$/u, "");
function keychainLookup(runner, platform) {
  if (platform === "darwin") {
    const r = runner("security", ["find-generic-password", "-s", "mm3", "-a", "typesafe", "-w"], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : void 0;
  }
  if (platform === "linux") {
    const r = runner("secret-tool", ["lookup", "service", "mm3", "account", "typesafe"], { timeoutMs: TIMEOUT_MS });
    return r.status === 0 && r.stdout.trim() ? cleanLine(r.stdout) : void 0;
  }
  return void 0;
}
function keychainStore(runner, platform, secret) {
  if (platform === "linux") {
    const r = runner("secret-tool", ["store", "--label=MM3", "service", "mm3", "account", "typesafe"], { input: secret, timeoutMs: TIMEOUT_MS });
    return r.status === 0 ? "stored" : "unavailable";
  }
  return "unavailable";
}
function keychainRemove(runner, platform) {
  if (platform === "darwin") {
    return runner("security", ["delete-generic-password", "-s", "mm3", "-a", "typesafe"], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  if (platform === "linux") {
    return runner("secret-tool", ["clear", "service", "mm3", "account", "typesafe"], { timeoutMs: TIMEOUT_MS }).status === 0;
  }
  return false;
}

// src/setup/keystore.ts
function resolveStoredKey(runner, platform, env = process.env) {
  const fromKeychain = keychainLookup(runner, platform);
  if (fromKeychain) return { apiKey: fromKeychain, source: "keychain", provider: "typesafe" };
  const file = readEnvFile(envFilePath(env));
  if (file?.values.TYPESAFE_API_KEY) return { apiKey: file.values.TYPESAFE_API_KEY, source: "file", provider: "typesafe" };
  if (file?.values.AI_GATEWAY_API_KEY) return { apiKey: file.values.AI_GATEWAY_API_KEY, source: "file", provider: "gateway" };
  return void 0;
}
function storeKey(runner, platform, env, provider, secret) {
  if (provider === "typesafe" && keychainStore(runner, platform, secret) === "stored") {
    return { stored: "keychain", detail: "OS keychain" };
  }
  const file = envFilePath(env);
  setEnvFileValue(file, provider === "typesafe" ? "TYPESAFE_API_KEY" : "AI_GATEWAY_API_KEY", secret);
  return { stored: "file", detail: file };
}
function removeStoredKey(runner, platform, env) {
  const removed = [];
  if (keychainRemove(runner, platform)) removed.push("keychain");
  const file = envFilePath(env);
  const a = removeEnvFileValue(file, "TYPESAFE_API_KEY");
  const b = removeEnvFileValue(file, "AI_GATEWAY_API_KEY");
  if (a !== "absent" || b !== "absent") removed.push("file");
  return { removed };
}

// src/setup/init.ts
import { existsSync as existsSync13, lstatSync as lstatSync2, mkdirSync as mkdirSync7, readFileSync as readFileSync18, readlinkSync, realpathSync as realpathSync2, writeFileSync as writeFileSync8 } from "node:fs";
import path15 from "node:path";

// src/verbs/doctor.ts
var import_yaml4 = __toESM(require_dist(), 1);
import { existsSync as existsSync11, readFileSync as readFileSync15, realpathSync } from "node:fs";
import path12 from "node:path";

// src/setup/agents-status.ts
import { existsSync as existsSync9, readFileSync as readFileSync12 } from "node:fs";
import path9 from "node:path";

// src/setup/agents-file.ts
import { existsSync as existsSync8, readFileSync as readFileSync11 } from "node:fs";
import path8 from "node:path";
var AGENTS_OPEN = "<!-- mm3:agents -->";
var AGENTS_CLOSE = "<!-- /mm3:agents -->";
var AGENTS_FILE = "AGENTS.md";
var CLAUDE_FILES = [
  { rel: "CLAUDE.md", importLine: "@AGENTS.md" },
  { rel: path8.join(".claude", "CLAUDE.md"), importLine: "@../AGENTS.md" }
];
var agentsBlock = () => `${AGENTS_OPEN}
${AGENT_POINTER2}
${AGENTS_CLOSE}`;
var importsAgents = (text) => text.split("\n").some((l) => l.trim() === "@AGENTS.md" || l.trim() === "@../AGENTS.md");
function findBlock(text) {
  const open = text.indexOf(AGENTS_OPEN);
  const close = text.indexOf(AGENTS_CLOSE);
  if (open < 0 && close < 0) return "none";
  if (open < 0 || close < open) return "broken";
  return { start: open, end: close + AGENTS_CLOSE.length };
}
var read = (root, rel) => {
  const p = path8.join(root, rel);
  return existsSync8(p) ? readFileSync11(p, "utf8") : void 0;
};
var endWithNewline = (s) => s === "" || s.endsWith("\n") ? s : `${s}
`;
function planAgents(root) {
  const edits = [];
  const block = agentsBlock();
  const existing = read(root, AGENTS_FILE);
  if (existing === void 0) {
    edits.push({ file: AGENTS_FILE, verb: "create", written: block, content: `${block}
`, done: `created ${AGENTS_FILE}` });
  } else {
    const span = findBlock(existing);
    if (span === "broken") {
      return { edits: [], problem: `${AGENTS_FILE} has an unmatched ${AGENTS_OPEN} marker \u2192 put the ${AGENTS_OPEN} and ${AGENTS_CLOSE} lines back as a pair (or delete both), then re-run "mm3 init --agents"` };
    }
    if (span === "none") {
      const base = endWithNewline(existing);
      edits.push({ file: AGENTS_FILE, verb: "append to", written: block, content: `${base}${base === "" ? "" : "\n"}${block}
`, done: `appended the mm3 block to ${AGENTS_FILE}` });
    } else if (existing.slice(span.start, span.end) !== block) {
      edits.push({ file: AGENTS_FILE, verb: "update the mm3 block in", written: block, content: `${existing.slice(0, span.start)}${block}${existing.slice(span.end)}`, done: `updated the mm3 block in ${AGENTS_FILE}` });
    }
  }
  for (const { rel, importLine } of CLAUDE_FILES) {
    const text = read(root, rel);
    if (text === void 0 || importsAgents(text)) continue;
    edits.push({ file: rel, verb: "append to", written: importLine, content: `${endWithNewline(text)}${importLine}
`, done: `appended ${importLine} to ${rel}` });
  }
  if (CLAUDE_FILES.every(({ rel }) => read(root, rel) === void 0)) {
    const { rel, importLine } = CLAUDE_FILES[0];
    edits.push({ file: rel, verb: "create", written: importLine, content: `${importLine}
`, done: `created ${rel} (imports ${AGENTS_FILE})` });
  }
  return { edits };
}

// src/setup/agents-status.ts
var read2 = (file) => existsSync9(file) ? readFileSync12(file, "utf8") : void 0;
function agentsState(root) {
  const agents = read2(path9.join(root, AGENTS_FILE));
  if (agents === void 0 || typeof findBlock(agents) === "string") return "no-block";
  const texts = CLAUDE_FILES.map(({ rel }) => read2(path9.join(root, rel)));
  if (texts.every((t) => t === void 0) || texts.some((t) => t !== void 0 && !importsAgents(t))) return "claude-md-no-import";
  return "ok";
}
var AGENTS_FIX = {
  "claude-md-no-import": "Claude reads CLAUDE.md, not AGENTS.md \u2192 add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)",
  "no-block": "no MM3 guidance in AGENTS.md \u2192 mm3 init --agents adds it (shows the lines first)"
};
function agentsDoctorValue(root) {
  const state = agentsState(root);
  return state === "ok" ? "ok" : AGENTS_FIX[state];
}
function agentsNote(paths) {
  if (nextRunNumber(paths) > 1) return void 0;
  const state = agentsState(paths.root);
  return state === "ok" ? void 0 : `agents: ${AGENTS_FIX[state]}`;
}

// src/setup/install-record.ts
import { existsSync as existsSync10, mkdirSync as mkdirSync5, readFileSync as readFileSync13, rmSync as rmSync4, writeFileSync as writeFileSync6 } from "node:fs";
import path10 from "node:path";
function installRecordPath(env = process.env) {
  return path10.join(mm3ConfigDir(env), "install.json");
}
function isInstallRecord(v) {
  if (!v || typeof v !== "object") return false;
  const r = v;
  return (r.mode === "global" || r.mode === "user" || r.mode === "local" || r.mode === "standalone") && typeof r.installedAt === "string";
}
function readInstallRecord(env = process.env) {
  const file = installRecordPath(env);
  if (!existsSync10(file)) return void 0;
  try {
    const parsed = JSON.parse(readFileSync13(file, "utf8"));
    return isInstallRecord(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function writeInstallRecord(env, record2) {
  const file = installRecordPath(env);
  mkdirSync5(path10.dirname(file), { recursive: true });
  writeFileSync6(file, `${JSON.stringify(record2, null, 2)}
`);
}
function clearInstallRecord(env = process.env) {
  const file = installRecordPath(env);
  if (existsSync10(file)) rmSync4(file, { force: true });
}

// src/setup/npm-info.ts
import { accessSync as accessSync2, constants as constants2, readFileSync as readFileSync14, statSync as statSync3 } from "node:fs";
import path11 from "node:path";
function findOnPath(name, env = process.env, platform = process.platform) {
  const pathVar = env.PATH ?? env.Path ?? "";
  const dirs = pathVar.split(path11.delimiter).filter(Boolean);
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path11.join(dir, name + ext);
      try {
        if (statSync3(candidate).isFile()) return candidate;
      } catch {
      }
    }
  }
  return void 0;
}
function lockDirAbove(packageDir, sep) {
  const segments = packageDir.split(sep);
  const idx = segments.lastIndexOf("node_modules");
  if (idx <= 0) return void 0;
  return segments.slice(0, idx).join(sep);
}
function detectSelfSpec(packageDir, pkg, readFile = (f) => readFileSync14(f, "utf8")) {
  const registry = { spec: `${pkg.name}@${pkg.version}`, kind: "registry" };
  try {
    const lockDir = lockDirAbove(packageDir, path11.sep);
    if (!lockDir) return registry;
    const lock = JSON.parse(readFile(path11.join(lockDir, "package-lock.json")));
    const resolved = lock.packages?.[`node_modules/${pkg.name}`]?.resolved;
    if (typeof resolved === "string" && resolved.startsWith("file:")) {
      const rel = decodeURIComponent(resolved.slice("file:".length));
      return { spec: path11.resolve(lockDir, rel), kind: "tarball" };
    }
  } catch {
  }
  return registry;
}
function isWritableDir(dir) {
  try {
    accessSync2(dir, constants2.W_OK);
    return true;
  } catch (e) {
    if (e.code !== "ENOENT") return false;
    const parent = path11.dirname(dir);
    return parent === dir ? false : isWritableDir(parent);
  }
}
function npmGlobalPrefix(runner) {
  const r = runner("npm", ["config", "get", "prefix"]);
  return r.status === 0 ? r.stdout.trim() || void 0 : void 0;
}

// src/contract/read.ts
var import_yaml3 = __toESM(require_dist(), 1);
var SKELETON = "(mm3 template class prints a skeleton)";
var QUESTION_LINE = /^\s*(\d+)\s*:\s?(.*)$/u;
var MAX_STOPS = 5;
function isQuotedWhole(s) {
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') || s.length >= 2 && s.startsWith("'") && s.endsWith("'");
}
function stripComment(line3) {
  let quote;
  for (let i = 0; i < line3.length; i++) {
    const c = line3[i];
    if (quote) {
      if (c === quote) quote = void 0;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/u.test(line3[i - 1]))) return line3.slice(0, i);
  }
  return line3;
}
function scanLines(src) {
  const stops = [];
  const lines = src.split(/\r?\n/u);
  for (const raw of lines) {
    const code = stripComment(raw);
    if (!code.trim()) continue;
    const q = QUESTION_LINE.exec(code);
    if (q) {
      const text = (q[2] ?? "").trim();
      if (!isQuotedWhole(text)) {
        if (text.startsWith("{")) stops.push(`\u2716 question ${q[1]} puts it in { } \u2192 use the indented form`);
        else if (/:(\s|$)/u.test(text)) stops.push(`\u2716 question ${q[1]} has ": " \u2192 put it in quotes`);
      }
    }
    if ([...code].length > MAX_QUESTION_CHARS) stops.push(`\u2716 yaml: "${clip(code.trim(), 40)}" is longer than ${MAX_QUESTION_CHARS} characters \u2192 shorten it`);
  }
  return stops;
}
function capStops(stops) {
  if (stops.length <= MAX_STOPS) return [...stops];
  return [...stops.slice(0, MAX_STOPS - 1), `\u2716 request: ${stops.length - (MAX_STOPS - 1)} more problems \u2192 fix the ones above, then run again`];
}
function sourceLine(lines, line3) {
  for (let no = Math.min(line3, lines.length); no >= 1; no--) {
    const text = lines[no - 1] ?? "";
    if (text.trim()) return { no, text };
  }
  return { no: line3, text: "" };
}
function startsValueWithIndicator(text) {
  const colon = text.indexOf(":");
  if (colon < 1) return false;
  const key2 = text.slice(0, colon);
  if (key2.includes("#") || key2.trim() === "") return false;
  return /^\s+[`@]/u.test(text.slice(colon + 1));
}
function describeParseError(lines, code, line3) {
  if (code === "MULTIPLE_DOCS") return "\u2716 yaml: more than one document (---) \u2192 send one request per run";
  const at = sourceLine(lines, line3);
  if (code === "TAB_AS_INDENT") return `\u2716 yaml: line ${at.no} is indented with a tab \u2192 indent with spaces`;
  if (code === "DUPLICATE_KEY") {
    const key2 = /^\s*(?:-\s+)?([^:#]+?)\s*:/u.exec(at.text)?.[1] ?? "";
    return /^\d+$/u.test(key2) ? `\u2716 question ${key2}: numbered twice (line ${at.no}) \u2192 give each question its own number` : `\u2716 yaml: line ${at.no} repeats the key "${clip(key2, 30)}" \u2192 give each key once`;
  }
  if (/[{}]/u.test(at.text)) return `\u2716 yaml: line ${at.no} puts a category or question in { } \u2192 use the indented form`;
  const q = QUESTION_LINE.exec(at.text);
  if (q && /:(\s|$)/u.test(q[2] ?? "")) return `\u2716 question ${q[1]} has ": " \u2192 put it in quotes`;
  if (startsValueWithIndicator(at.text)) return `\u2716 yaml: line ${at.no} starts a value with ${at.text.includes(": @") ? "an @" : "a backtick"} \u2192 put the whole value in "quotes"`;
  return `\u2716 yaml: line ${at.no} does not parse \u2192 use the indented form, and put any question with ": " or " #" in quotes`;
}
function readRequestText(text) {
  const src = text.replace(/^﻿/u, "");
  if (!src.trim()) return { ok: false, stops: [`\u2716 request: empty \u2192 start with "mak:" ${SKELETON}`] };
  if (/^\s*mm3\s+\w+\s+L\d/u.test(src)) return { ok: false, stops: [`\u2716 request: this is the old text format \u2192 send YAML ${SKELETON}`] };
  const scanned = scanLines(src);
  if (scanned.length) return { ok: false, stops: capStops(scanned) };
  const doc = (0, import_yaml3.parseDocument)(src, { version: "1.2", schema: "core", uniqueKeys: true });
  const first = doc.errors[0];
  if (first) return { ok: false, stops: [describeParseError(src.split(/\r?\n/u), first.code, first.linePos?.[0]?.line ?? 1)] };
  let value;
  try {
    value = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { ok: false, stops: ["\u2716 yaml: too many aliases (*) \u2192 write the request out in full"] };
  }
  if (value === null || value === void 0) return { ok: false, stops: [`\u2716 request: empty \u2192 start with "mak:" ${SKELETON}`] };
  if (typeof value !== "object" || Array.isArray(value)) return { ok: false, stops: [`\u2716 request: not a YAML mapping \u2192 start with "mak:" ${SKELETON}`] };
  return { ok: true, value };
}

// src/contract/layers.ts
var MAX_LAYERS = 4;
var NAME2 = /^[^/#\n]{1,80}$/u;
var TAG2 = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
var BLANK = /\{([a-z0-9]+(?:-[a-z0-9]+)*)\}/gu;
function parseItem(raw) {
  if (typeof raw === "string") return { name: raw.trim(), children: {} };
  if (typeof raw === "number") return { name: String(raw), children: {} };
  if (isObj3(raw)) {
    if ("name" in raw) {
      const { name, ...children } = raw;
      if (typeof name !== "string" && typeof name !== "number") return { problem: "an item has a name: that is not text \u2192 write its name as text" };
      return { name: String(name).trim(), children };
    }
    const keys = Object.keys(raw);
    if (keys.length === 1) {
      const name = keys[0];
      const v = raw[name];
      if (v === null) return { name: name.trim(), children: {} };
      if (isObj3(v)) return { name: name.trim(), children: v };
      return { problem: `"${clip(name, 30)}" has a value but no layer name \u2192 write "- name: ${clip(name, 30)}" and "<layer>: [...]"` };
    }
    return { problem: 'an item with several keys needs name: \u2192 write "- name: <item>" plus its child layers' };
  }
  return { problem: "an item is empty or not text \u2192 write its name" };
}
function mapLayers(over) {
  const chain = Object.keys(over);
  const layers = [...chain];
  const ancestors = /* @__PURE__ */ new Map();
  const problems = [];
  const link = (child, parent) => {
    const set = ancestors.get(child) ?? /* @__PURE__ */ new Set();
    ancestors.set(child, set);
    if (parent === null) return;
    set.add(parent);
    for (const a of ancestors.get(parent) ?? []) set.add(a);
  };
  chain.forEach((l, i) => link(l, i ? chain[i - 1] : null));
  const walk2 = (layer, value) => {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      const it = parseItem(raw);
      if ("problem" in it) continue;
      for (const [child, v] of Object.entries(it.children)) {
        if (chain.includes(child)) {
          problems.push(`\u2716 mak.over.${clip(child, 20)}: used at the top and inside "${clip(it.name, 30)}" \u2192 pick one`);
          continue;
        }
        if (!layers.includes(child)) layers.push(child);
        link(child, layer);
        walk2(child, v);
      }
    }
  };
  for (const l of chain) walk2(l, over[l]);
  if (layers.length > MAX_LAYERS) problems.push(`\u2716 mak.over: ${layers.length} layers \u2192 at most ${MAX_LAYERS}; split the request`);
  for (const l of layers) if (l === "concerns" || l === "decisions") problems.push(`\u2716 mak.over.${l}: "${l}" is reserved for ask sections \u2192 use a different layer name`);
  return { layers, chain, ancestors, problems: [...new Set(problems)] };
}
function firstStringLayer(over) {
  for (const [layer, v] of Object.entries(over)) {
    if (typeof v === "string") return layer;
    if (!Array.isArray(v)) continue;
    for (const raw of v) {
      const it = parseItem(raw);
      if ("problem" in it) continue;
      const found = firstStringLayer(it.children);
      if (found) return found;
    }
  }
  return null;
}
function checkOver(over, rule, cap) {
  const { chain, problems } = mapLayers(over);
  const out = [...problems];
  const counts = /* @__PURE__ */ new Map();
  chain.forEach((layer, i) => {
    const v = over[layer];
    if (typeof v !== "string") {
      if (i > 0) out.push(`\u2716 mak.over.${layer}: a list at the top applies to nothing \u2192 nest it under its parent items (- name: x, ${layer}: [...]), or use each`);
      return;
    }
    if (rule === "none") out.push(`\u2716 mak.over.${layer}: loop sweeps ideas you list \u2192 write the items as a list; use scan for files`);
    else if (rule === "scan" && i === 0 && v === "each") out.push(`\u2716 mak.over.${layer}: scan needs a file pattern first \u2192 e.g. ${layer}: src/**/*.ts`);
    else if ((rule === "each-only" || i > 0) && v !== "each") out.push(`\u2716 mak.over.${layer}: "${clip(v, 30)}" \u2192 use each (we split the layer above)`);
    else if (rule === "scan" && i === 0 && (v.startsWith("/") || v.split("/").includes(".."))) out.push(`\u2716 mak.over.${layer}: "${clip(v, 40)}" is outside the project \u2192 use a pattern inside it`);
  });
  if (rule === "scan" && typeof over[chain[0]] !== "string") out.push(`\u2716 mak.over.${chain[0]}: scan needs a file pattern first \u2192 e.g. ${chain[0]}: src/**/*.ts`);
  const walk2 = (layer, value, under) => {
    if (typeof value === "string") return;
    if (!Array.isArray(value)) {
      out.push(`\u2716 mak.over.${layer}: under ${under}, ${layer} must be a list \u2192 ${layer}: [a, b]`);
      return;
    }
    counts.set(layer, (counts.get(layer) ?? 0) + value.length);
    const seen = /* @__PURE__ */ new Set();
    for (const raw of value) {
      const it = parseItem(raw);
      if ("problem" in it) {
        out.push(`\u2716 mak.over.${layer}: ${it.problem}`);
        continue;
      }
      if (!NAME2.test(it.name)) out.push(`\u2716 mak.over.${layer}: item "${clip(it.name, 30)}" \u2192 names are 1\u201380 characters, without "/" or "#"`);
      if (seen.has(it.name)) out.push(`\u2716 mak.over.${layer}: "${clip(it.name, 30)}" twice under ${under} \u2192 give each item its own name`);
      seen.add(it.name);
      for (const [child, v] of Object.entries(it.children)) {
        if (!TAG2.test(child) || child.length > 20) {
          out.push(`\u2716 mak.over.${layer}: under "${clip(it.name, 30)}", "${clip(child, 20)}" is not a layer name \u2192 lowercase, one word or kebab-case`);
          continue;
        }
        walk2(child, v, `"${clip(it.name, 30)}"`);
      }
    }
  };
  for (const l of chain) walk2(l, over[l], "the top");
  for (const [layer, n] of counts) {
    if (n > cap) out.push(`\u2716 mak.over.${layer}: ${n} items \u2192 at most ${cap} per layer at this depth; raise depth or split the request`);
  }
  return [...new Set(out)];
}
function expand(over, opts = {}) {
  const { layers, chain } = mapLayers(over);
  const items = [];
  const add = (layer, value, parent) => {
    const entries = [];
    if (typeof value === "string") {
      if (!opts.resolve) throw new Error(`layer ${layer}: "${value}" needs a resolver`);
      for (const r of opts.resolve(layer, value, parent)) entries.push({ ...r, children: {} });
    } else if (Array.isArray(value)) {
      for (const raw of value) {
        const it = parseItem(raw);
        if (!("problem" in it)) entries.push({ name: it.name, text: it.name, children: it.children });
      }
    }
    const next = chain[chain.indexOf(layer) + 1];
    for (const e of entries) {
      const item = {
        id: parent ? `${parent.id}/${e.name}` : e.name,
        layer,
        name: e.name,
        parent: parent?.id ?? null,
        fill: { ...parent?.fill ?? {}, [layer]: e.name },
        text: e.text,
        ...e.unit ? { unit: e.unit } : {}
      };
      items.push(item);
      for (const [child, v] of Object.entries(e.children)) add(child, v, item);
      if (chain.includes(layer) && next !== void 0) add(next, over[next], item);
    }
  };
  add(chain[0], over[chain[0]], opts.root ?? null);
  return { layers, items };
}
function blanksIn(text) {
  return [...text.matchAll(BLANK)].map((m2) => m2[1]);
}
function fillBlanks(text, fill) {
  return text.replace(BLANK, (m2, name) => fill[name] ?? m2);
}

// src/contract/validate.ts
var probesAt = (limits, depth) => limits?.depth?.[DEPTHS.indexOf(depth)] ?? DEPTH_COUNT[depth] / 3;
var itemCapAt = (limits, depth) => limits?.itemsPerLayer?.[depth] ?? SWEEP_ITEM_CAP[depth];
var NEEDS = {
  class: ["depth", "where", "ask"],
  view: ["where"],
  replay: ["parent", "compare", "expect"],
  scan: ["depth", "over", "ask"],
  loop: ["depth", "over", "ask"],
  drill: ["parent", "from", "ask"]
};
var NEVER = {
  class: ["over", "from", "compare", "expect"],
  view: ["over", "from", "compare", "expect"],
  replay: ["ask", "over", "from", "where", "depth"],
  scan: ["where", "from", "compare", "expect"],
  loop: ["from", "compare", "expect"],
  drill: ["compare", "where", "expect"]
};
var STRINGS = { scan: "scan", drill: "each-only", loop: "none", class: "none", view: "none", replay: "none" };
var RESERVED2 = ["id", "gate", "goal", "consensus", "escalate", "regressed", "expected", "failing", "passing", "scanned", "reused", "view", "reuse", "runs", "categories"];
var IRREVERSIBLE = /\b(delete|deploy|drop|pay|payment|migrat\w*|secret|credential)s?\b/iu;
var IRREVERSIBLE_NOTE = "looks irreversible; don't act on this alone";
function how(field, verb, limits) {
  const sweep = verb === "scan" || verb === "loop" || verb === "drill";
  switch (field) {
    case "depth":
      return sweep ? `add "depth: quick" (at most ${itemCapAt(limits, "quick")} items asked per layer; standard ${itemCapAt(limits, "standard")}, thorough ${itemCapAt(limits, "thorough")})` : `add "depth: quick" (${3 * probesAt(limits, "quick")} yes/no questions across ${probesAt(limits, "quick")} concerns; standard ${3 * probesAt(limits, "standard")}, thorough ${3 * probesAt(limits, "thorough")})`;
    case "where":
      return 'add "where: [path/to/file.ts]"';
    case "ask":
      return `add ask: with concerns: and decisions: (mm3 template ${verb})`;
    case "parent":
      return 'add "parent: MM3-####" (the run this builds on)';
    case "compare":
      return 'add "compare: {before: main, after: HEAD}"';
    case "over":
      return `add over: with the layers to sweep (mm3 template ${verb})`;
    case "from":
      return 'add "from: <an item id or a category of the parent run>"';
    case "expect":
      return `add "expect: [concern-name, ...]" (which of the parent's concerns this replay should fix), or "expect: none" to predict no flips`;
  }
}
function never(field, verb) {
  if (verb === "replay" && field === "ask") return "\u2716 mak.ask: replay re-runs the parent's questions \u2192 remove ask; for new questions, use class";
  if (field === "expect") return "\u2716 mak.expect: only replay predicts fixed concerns \u2192 remove it";
  if (field === "over") return `\u2716 mak.over: ${verb} asks about one subject \u2192 remove over, or use loop or scan to sweep`;
  if (field === "where" && verb === "scan") return "\u2716 mak.where: scan reads the files in over \u2192 remove where";
  if (field === "where") return `\u2716 mak.where: ${verb} reads the parent run's code \u2192 remove where`;
  return `\u2716 mak.${field}: ${verb} doesn't take it \u2192 remove it`;
}
var cross = (text) => ({ cls: "cross", text });
function findBlanks(v, path28, out) {
  const label = (p) => {
    const q = /^mak\.ask\..*\.(\d+)$/u.exec(p);
    return q ? `question ${q[1]}` : p;
  };
  if (typeof v === "string") {
    if (v.includes("____")) out.push(cross(`\u2716 ${label(path28)}: still a ____ blank \u2192 fill it in`));
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => findBlanks(x, `${path28}[${i}]`, out));
    return;
  }
  if (isObj3(v)) {
    for (const [k, x] of Object.entries(v)) {
      const p = path28 ? `${path28}.${k}` : k;
      if (k.includes("____")) out.push(cross(`\u2716 ${label(p)}: still a ____ blank \u2192 fill it in`));
      else findBlanks(x, p, out);
    }
  }
}
function toQuestion(n, raw) {
  if (typeof raw === "string") return { n, kind: "yesno", text: raw };
  const o = raw;
  if ("scale" in o) return { n, kind: "scale", text: o.scale, levels: o.levels };
  return { n, kind: "choice", text: o.choice, options: o.options };
}
function familyFor(raw, name, section) {
  if (section !== "concerns") return {};
  const given = raw.family;
  if (typeof given === "string" && FAMILIES.includes(given)) return { family: given, familySource: "given" };
  if (FAMILIES.includes(name)) return { family: name, familySource: "name" };
  return {};
}
function toCategory(name, raw, section) {
  const pass = raw.pass === true ? "yes" : raw.pass === false ? "no" : raw.pass;
  const questions = Object.entries(raw).filter(([k]) => /^[1-9][0-9]*$/u.test(k)).map(([k, q]) => toQuestion(Number(k), q)).sort((a, b) => a.n - b.n);
  return { name, section, ...familyFor(raw, name, section), pass, need: raw.need ?? "all", tags: raw.tags ?? [], questions };
}
function checkCategory2(c, field, out) {
  const kinds = new Set(c.questions.map((q) => q.kind));
  if (c.questions.length === 0) out.push(cross(`\u2716 ${field}: no questions \u2192 add at least one numbered question`));
  if (RESERVED2.includes(c.name)) out.push(cross(`\u2716 ${field}: "${c.name}" is a word the answer uses \u2192 rename the category`));
  if (kinds.size > 1) {
    out.push(cross(`\u2716 ${field}: mixes ${[...kinds].map((k) => k === "yesno" ? "yes/no" : k).join(" and ")} questions \u2192 one kind per category`));
    return;
  }
  const kind = [...kinds][0];
  if (c.section === "concerns") {
    if (kind && kind !== "yesno") out.push(cross(`\u2716 ${field}: a concerns category must be yes/no only \u2192 use decisions: for scale or choice`));
    if (Array.isArray(c.pass)) out.push(cross(`\u2716 ${field}.pass: a list is for scale or choice questions \u2192 use yes or no`));
    return;
  }
  if (kind === "yesno") out.push(cross(`\u2716 ${field}: a decisions category must be scale or choice \u2192 use concerns: for yes/no`));
  if (kind && kind !== "yesno") {
    if (!Array.isArray(c.pass)) {
      out.push(cross(`\u2716 ${field}.pass: ${kind} questions need the passing ${kind === "scale" ? "levels" : "options"} \u2192 e.g. pass: [none, low]`));
      return;
    }
    for (const q of c.questions) {
      const allowed = q.kind === "scale" ? q.levels : q.kind === "choice" ? q.options : [];
      const unknown = c.pass.find((p) => !allowed.includes(p));
      if (unknown !== void 0) {
        out.push(cross(`\u2716 ${field}.pass: "${clip(unknown, 20)}" is not ${q.kind === "scale" ? "a level" : "an option"} of question ${q.n} \u2192 use some of ${allowed.join(", ")}`));
      }
    }
  }
}
function buildCategories(sections, field, out) {
  const cats = [];
  for (const section of ["concerns", "decisions"]) {
    const map = sections[section];
    if (!isObj3(map)) continue;
    for (const [name, raw] of Object.entries(map)) {
      if (!isObj3(raw)) continue;
      const c = toCategory(name, raw, section);
      checkCategory2(c, `${field}.${section}.${name}`, out);
      if (section === "decisions" && "family" in raw) {
        out.push(cross(`\u2716 ${field}.decisions.${name}.family: family only applies to concerns categories \u2192 remove it`));
      }
      cats.push(c);
    }
  }
  const concernNums = cats.filter((c) => c.section === "concerns").flatMap((c) => c.questions.map((q) => q.n));
  const decisionNums = cats.filter((c) => c.section === "decisions").flatMap((c) => c.questions.map((q) => q.n));
  if (concernNums.length && decisionNums.length && Math.max(...concernNums) > Math.min(...decisionNums)) {
    out.push(cross(`\u2716 ${field}: decisions must be numbered after every concern \u2192 renumber decisions last`));
  }
  return cats;
}
function checkNumbers(categories, out) {
  const seen = /* @__PURE__ */ new Set();
  for (const n of categories.flatMap((c) => c.questions.map((q) => q.n))) {
    if (seen.has(n)) out.push(cross(`\u2716 question ${n}: numbered twice \u2192 give each question its own number`));
    seen.add(n);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  if (sorted.some((n, i) => n !== i + 1)) out.push(cross(`\u2716 question numbers: ${clip(sorted.join(" "), 60)} \u2192 number them 1\u2026${sorted.length} with no gaps`));
}
function contractIssues(categories, depth, field, limits) {
  const out = [];
  const concerns = categories.filter((c) => c.section === "concerns");
  const decisions = categories.filter((c) => c.section === "decisions");
  for (const c of concerns) {
    if (c.questions.every((q) => q.kind === "yesno") && c.questions.length !== 3) {
      out.push({ field: `${field}.concerns.${c.name}`, problem: `${c.questions.length} probe${c.questions.length === 1 ? "" : "s"}`, fix: "give it exactly 3" });
    }
  }
  for (const c of decisions) {
    if (c.questions.some((q) => q.kind !== "yesno") && c.questions.length !== 1) {
      out.push({ field: `${field}.decisions.${c.name}`, problem: `${c.questions.length} questions`, fix: "give it exactly 1" });
    }
  }
  if (depth !== void 0) {
    const want = probesAt(limits, depth);
    if (concerns.length !== want) {
      out.push({ field: `${field}.concerns`, problem: `${concerns.length} categor${concerns.length === 1 ? "y" : "ies"}`, fix: `${depth} needs exactly ${want}` });
    }
  }
  if (decisions.length < DECISIONS_MIN || decisions.length > DECISIONS_MAX) {
    out.push({ field: `${field}.decisions`, problem: `${decisions.length} categor${decisions.length === 1 ? "y" : "ies"}`, fix: decisions.length === 0 ? `copy the decisions: section from mm3 template class (${DECISIONS_MIN}\u2013${DECISIONS_MAX} categories, a scale and a choice)` : `give ${DECISIONS_MIN}\u2013${DECISIONS_MAX}` });
  } else {
    const kinds = new Set(decisions.flatMap((c) => c.questions.map((q) => q.kind)));
    if (!kinds.has("scale")) out.push({ field: `${field}.decisions`, problem: "no scale question", fix: "add at least one scale: question" });
    if (!kinds.has("choice")) out.push({ field: `${field}.decisions`, problem: "no choice question", fix: "add at least one choice: question" });
  }
  return out;
}
function checkCross(raw, verb, limits) {
  const out = [];
  const notes = [];
  const mak = raw.mak;
  if (mak.verb !== void 0 && mak.verb !== verb) out.push(cross(`\u2716 mak.verb: says "${mak.verb}" but you ran ${verb} \u2192 remove mak.verb, or run mm3 ${mak.verb}`));
  for (const f of NEEDS[verb]) if (!(f in mak)) out.push(cross(`\u2716 mak.${f}: ${verb} needs it \u2192 ${how(f, verb, limits)}`));
  for (const f of NEVER[verb]) if (f in mak) out.push(cross(never(f, verb)));
  const over = mak.over;
  const ask2 = mak.ask ?? {};
  const depth = mak.depth;
  const categories = [];
  const layers = [];
  if (over === void 0) {
    const categoriesGiven = Object.keys(ask2).length > 0;
    const cats = buildCategories(ask2, "mak.ask", out);
    categories.push(...cats);
    for (const c of cats) {
      for (const q of c.questions) {
        const b = blanksIn(q.text)[0];
        if (b !== void 0 && verb !== "drill") out.push(cross(`\u2716 question ${q.n}: {${b}} has nothing to fill it \u2192 blanks are for sweeps (over:); write the name out`));
      }
    }
    checkNumbers(cats, out);
    if (categoriesGiven) {
      const issues = contractIssues(cats, depth, "mak.ask", limits);
      if (verb === "view") {
        for (const i of issues) notes.push(`${i.field}: ${i.problem} (${i.fix}); class will stop on this`);
      } else {
        for (const i of issues) out.push(cross(`\u2716 ${i.field}: ${i.problem} \u2192 ${i.fix} \u2192 see: mm3 agent probe`));
      }
    }
  } else {
    for (const p of checkOver(over, STRINGS[verb], itemCapAt(limits, depth ?? "quick"))) out.push(cross(p));
    const map = mapLayers(over);
    const finest = map.layers.at(-1);
    for (const [name, v] of Object.entries(ask2)) {
      if (name === "concerns" || name === "decisions" || isObj3(v) && "pass" in v) {
        out.push(cross(`\u2716 mak.ask.${name}: a sweep keys categories by layer \u2192 ask: {<layer>: {concerns: ..., decisions: ...}}`));
        continue;
      }
      if (!map.layers.includes(name)) {
        out.push(cross(`\u2716 mak.ask.${name}: not a layer in over \u2192 use one of ${map.layers.join(", ")}`));
        continue;
      }
      const sections = v ?? {};
      const cats = buildCategories(sections, `mak.ask.${name}`, out);
      const allowed = [name, ...map.ancestors.get(name) ?? []];
      for (const c of cats) {
        for (const q of c.questions) {
          for (const b of blanksIn(q.text)) {
            if (!allowed.includes(b) && !(verb === "drill" && !map.layers.includes(b))) {
              out.push(cross(`\u2716 question ${q.n}: {${b}} is not ${name}'s layer or above it \u2192 use ${allowed.map((a) => `{${a}}`).join(" or ")}`));
            }
          }
        }
      }
      layers.push({ name, categories: cats });
      categories.push(...cats);
      if (cats.length > 0) {
        const isFinest = name === finest;
        const issues = contractIssues(cats, isFinest ? depth : void 0, `mak.ask.${name}`, limits);
        if (isFinest) {
          for (const i of issues) out.push(cross(`\u2716 ${i.field}: ${i.problem} \u2192 ${i.fix} \u2192 see: mm3 agent probe`));
        } else if (issues.length) {
          notes.push(`mak.ask.${name} ask is thin (optional layer; counts aren't enforced) \u2014 e.g. ${issues[0].field}: ${issues[0].problem}`);
        }
      }
    }
    checkNumbers(categories, out);
    layers.sort((a, b) => map.layers.indexOf(a.name) - map.layers.indexOf(b.name));
  }
  if (out.length) return { stops: out, notes };
  return {
    stops: [],
    notes,
    mak: {
      ...mak.verb !== void 0 ? { verb: mak.verb } : {},
      goal: mak.goal,
      ...depth ? { depth } : {},
      where: mak.where ?? [],
      ...mak.parent !== void 0 ? { parent: mak.parent } : {},
      ...mak.from !== void 0 ? { from: mak.from } : {},
      ...mak.compare !== void 0 ? { compare: mak.compare } : {},
      ...mak.expect !== void 0 ? { expect: Array.isArray(mak.expect) && mak.expect.length === 0 ? "none" : mak.expect } : {},
      categories: over === void 0 ? categories : [],
      layers,
      ...over !== void 0 ? { over } : {}
    }
  };
}
function validateRequest(value, verb, rawText, mdlFields, limits) {
  const blanks = [];
  findBlanks(value, "", blanks);
  if (blanks.length) return { ok: false, stops: blanks };
  const schema = checkSchema(value, verb, rawText, mdlFields);
  if (schema.length) return { ok: false, stops: schema };
  const raw = value;
  const { stops, mak, notes: crossNotes } = checkCross(raw, verb, limits);
  if (!mak) return { ok: false, stops };
  const notes = [...crossNotes];
  const risky = IRREVERSIBLE.exec(mak.goal);
  if (risky) notes.push(`${IRREVERSIBLE_NOTE} ("${risky[0].toLowerCase()}")`);
  const w = raw.mdl;
  return { ok: true, request: { mak, mdl: w && Object.keys(w).length ? w : null }, notes };
}

// src/verbs/request.ts
var MAX_STOPS2 = 5;
function stopText(stops, verb) {
  if (!stops.length) return "";
  const lines = stops.length <= MAX_STOPS2 ? [...stops] : [...stops.slice(0, MAX_STOPS2), `\u2716 request: ${stops.length - MAX_STOPS2} more problems \u2192 fix the ones above, then run again`];
  return [...lines, `\u2192 see: mm3 agent ${verb}`].join("\n");
}
function loadRequest(text, verb, mdlFields, limits) {
  const read3 = readRequestText(text);
  if (!read3.ok) return { ok: false, result: { exit: 2, text: stopText(read3.stops, verb) } };
  const v = validateRequest(read3.value, verb, text, mdlFields, limits);
  if (!v.ok) return { ok: false, result: { exit: 2, text: stopText(v.stops.map((s) => s.text), verb) } };
  return { ok: true, request: v.request, notes: v.notes };
}
function contractLimits(cfg, verb) {
  const tiers = verb === "class" || verb === "scan" || verb === "loop" ? cfg.depth[verb] : verb === "view" ? cfg.depth.class : void 0;
  return { ...tiers ? { depth: tiers } : {}, itemsPerLayer: cfg.sweep.itemsPerLayer };
}

// src/verbs/doctor.ts
function identityFor(env, config) {
  const wanted = env.MM3_PROVIDER?.trim();
  if (wanted === "chaos") return { adapter: "chaos", route: "chaos", model: CHAOS_MODEL, baseURL: null };
  const usingTypesafe = wanted === "typesafe" || wanted !== "fake" && hasKey(config);
  if (!usingTypesafe) return { adapter: "fake", route: "fake", model: FAKE_MODEL, baseURL: null };
  const route = routeLabel(config);
  return {
    adapter: "typesafe",
    route,
    model: config.model,
    baseURL: config.baseURL,
    ...config.route === "gateway" ? { wireModel: config.wireModel } : {}
  };
}
var octal4 = (mode) => mode.toString(8).padStart(4, "0");
function actorLine(env) {
  const set = env.MM3_ACTOR?.trim();
  return set || "agent (default) \u2192 set MM3_ACTOR to change";
}
function noKeyHint(env) {
  return inPluginContext(env) ? `none (sample answers only) \u2192 ${NO_KEY_PLUGIN_HINT}` : 'no  \u2192 run "mm3 init" to add one';
}
function keyLine(env, config, deps) {
  if (!config.apiKey) return { value: noKeyHint(env) };
  if (config.keySource === "keychain") {
    return { value: "yes \xB7 from OS keychain (encrypted, per user)" };
  }
  if (config.keySource === "file") {
    const file = envFilePath(env);
    const read3 = readEnvFile(file);
    const mode = read3?.mode ?? 384;
    const note = read3 ? looseFileModeWarning(file, mode) ?? (read3.ignoredLines > 0 ? `\u2716 credentials: ${file} has ${read3.ignoredLines} line(s) mm3 ignored (not "export NAME='value'" for an allowed name) \u2192 fix or remove those lines` : void 0) : void 0;
    return { value: `yes \xB7 from user file ${file} (${octal4(mode)}, not encrypted)`, note };
  }
  const envVar = config.route === "gateway" ? "AI_GATEWAY_API_KEY" : "TYPESAFE_API_KEY";
  const stored = deps.resolveStored?.();
  return { value: `yes \xB7 from env ${envVar}${stored ? " (overrides stored)" : ""}` };
}
function versionOnPath(bin) {
  try {
    let dir = path12.dirname(realpathSync(bin));
    for (let i = 0; i < 6; i++) {
      const pj = path12.join(dir, "package.json");
      if (existsSync11(pj)) {
        const meta = JSON.parse(readFileSync15(pj, "utf8"));
        return meta.name === "@mvpscale/mm3" ? meta.version : void 0;
      }
      const up = path12.dirname(dir);
      if (up === dir) return void 0;
      dir = up;
    }
  } catch {
    return void 0;
  }
  return void 0;
}
function versionsLine(running, plugin) {
  const base = (v) => v.split("-")[0] ?? v;
  const nightlySha = /\.g([0-9a-f]{7,40})$/.exec(running)?.[1];
  const sameBase = plugin.version !== void 0 && base(plugin.version) === base(running);
  const sameCommit = nightlySha === void 0 || plugin.sha.startsWith(nightlySha.slice(0, 7)) || nightlySha.startsWith(plugin.sha.slice(0, 7));
  if (sameBase && sameCommit) return plugin.version === running ? `\u2714 the plugin and this copy are both ${running}` : `\u2714 the plugin and this copy are the same build (${running})`;
  return `\u26A0 the plugin is ${plugin.version ?? "an unknown version"} (${plugin.sha.slice(0, 7)}) and this copy is ${running} \u2192 update the older one: /plugin update in Claude Code, or npm install -g @mvpscale/mm3@${running.includes("-nightly.") ? "nightly" : "latest"}`;
}
function cliLine(env, platform, version) {
  const resolved = findOnPath("mm3", env, platform);
  const drift = resolved && version ? versionOnPath(resolved) : void 0;
  const mismatch = drift && drift !== version ? ` \xB7 \u26A0 version ${drift}, this is ${version} \u2192 run "mm3 init" to match them` : "";
  const record2 = readInstallRecord(env);
  if (!resolved && !record2) return 'not on PATH \u2192 run "mm3 init" to install it';
  const shown2 = resolved ?? "(not currently on PATH)";
  if (!record2) return `${shown2} \xB7 on PATH${mismatch}`;
  if (record2.mode === "standalone") return `${shown2} \xB7 installed standalone (file ${record2.binPath ?? "?"}, ${record2.version ?? "unknown version"})${mismatch}`;
  const flag = record2.mode === "global" ? "--global" : record2.mode === "user" ? "--user" : "--local";
  const detail = record2.mode === "local" ? `project ${record2.projectDir ?? "?"}` : `npm prefix ${record2.npmPrefix ?? "?"}`;
  return `${shown2} \xB7 installed ${flag} (${detail})${mismatch}`;
}
function pluginLine(deps) {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  if (!status.installed) return 'not installed \u2192 "mm3 init --claude"';
  const scopes = status.scopes;
  const scope = scopes[0] ?? "user";
  const userOnly = scopes.length === 1 && scope === "user";
  return `mm3@mvp-scale \xB7 ${scope} scope${userOnly ? ' (every project) \u2192 for just this one, "mm3 init --scope project"' : ""}`;
}
function projectLine(root, deps) {
  const status = deps.runner ? pluginStatus(deps.runner) : { installed: false, scopes: [] };
  const scopes = status.scopes;
  const enabled = scopes.includes("project") || scopes.includes("user") || scopes.includes("local");
  return `${root} \xB7 plugin enabled here: ${enabled ? "yes" : "no"}`;
}
function configField(paths) {
  const status = configStatus(paths);
  const line3 = statusLine(status);
  if (status.fileStops.length) return [...status.fileStops.map((s) => s.text), ...line3 ? [line3] : []];
  if (status.kind === "defaults") return "\u2714 config: defaults";
  return status.kind === "loaded" ? `\u2714 ${line3}` : line3;
}
var MAX_DOCTOR_STOPS = 5;
function doctorStops(lines) {
  const capped = lines.length <= MAX_DOCTOR_STOPS ? [...lines] : [...lines.slice(0, MAX_DOCTOR_STOPS), `\u2716 request: ${lines.length - MAX_DOCTOR_STOPS} more problems \u2192 fix the ones above, then run again`];
  return [...capped, "\u2192 see: mm3 agent doctor"].join("\n");
}
var isRequestShaped = (text) => /^mak\s*:/mu.test(text);
function sniffVerb(text) {
  try {
    const doc = (0, import_yaml4.parseDocument)(text, { version: "1.2", schema: "core", uniqueKeys: true });
    if (doc.errors.length) return "class";
    const value = doc.toJS({ maxAliasCount: 50 });
    const verb = value?.mak?.verb;
    return typeof verb === "string" && VERBS.includes(verb) ? verb : "class";
  } catch {
    return "class";
  }
}
function singleTrailingPointer(text) {
  const lines = text.split("\n");
  const last = lines.length - 1;
  return lines.map((line3, i) => i === last ? line3 : line3.replace(/ → see: mm3 agent \S+$/, "")).join("\n");
}
function runDoctorFile(text) {
  if (isRequestShaped(text)) {
    const verb = sniffVerb(text);
    const loaded = loadRequest(text, verb);
    if (!loaded.ok) return { ...loaded.result, text: singleTrailingPointer(loaded.result.text) };
    return { exit: 0, text: `\u2714 request: valid \u2192 checked as ${verb}` };
  }
  let raw;
  try {
    const doc = (0, import_yaml4.parseDocument)(text, { version: "1.2", schema: "core", uniqueKeys: true });
    const first = doc.errors[0];
    if (first) {
      const line3 = first.linePos?.[0]?.line ?? 1;
      return { exit: 2, text: doctorStops([`\u2716 config: line ${line3} does not parse \u2192 fix the YAML syntax`]) };
    }
    raw = doc.toJS({ maxAliasCount: 50 });
  } catch {
    return { exit: 2, text: doctorStops(["\u2716 config: too many aliases (*) \u2192 write it out in full"]) };
  }
  if (raw === null || raw === void 0) return { exit: 0, text: "\u2714 config: valid" };
  const { stops } = validateConfig(raw);
  if (stops.length) return { exit: 2, text: doctorStops(stops.map((s) => s.text)) };
  return { exit: 0, text: "\u2714 config: valid" };
}
function runDoctor(env, paths, nodeVersion = process.version, deps = {}) {
  let config;
  try {
    config = resolveJevConfig(env, { resolveStored: deps.resolveStored });
  } catch (e) {
    if (e instanceof JevConfigError) return { exit: 2, text: `${e.message}
` };
    throw e;
  }
  const who = identityFor(env, config);
  const project = paths ? projectLine(path12.relative(process.cwd(), paths.root) || ".", deps) : "none";
  const { value: key2, note: keyNote } = keyLine(env, config, deps);
  const notes = [
    "free: no call, no spend",
    ...paths ? [] : ["no project found here or above \u2192 run inside one, or set MM3_HOME"],
    ...keyNote ? [keyNote] : [],
    ...nearMissNotes(paths)
  ];
  const doc = m(
    [
      "doctor",
      m(
        ["provider", who.adapter],
        ["route", who.route],
        ...who.baseURL ? [["baseURL", who.baseURL]] : [],
        ["model", who.model],
        ...who.wireModel ? [["wireModel", who.wireModel]] : [],
        ["key", key2],
        ["project", project],
        ["actor", actorLine(env)],
        ["node", doctorNodeValue(nodeVersion)],
        ["index", nodeVersionOk(nodeVersion) ? sqliteAvailable() ? "node:sqlite" : "unavailable (unexpected on Node 22.13+)" : DOCTOR_INDEX_TOO_OLD],
        ["cli", cliLine(env, deps.platform ?? process.platform, deps.version)],
        ["plugin", pluginLine(deps)],
        ...deps.pluginInstall && deps.version ? [["versions", versionsLine(deps.version, deps.pluginInstall)]] : [],
        ...paths ? [["agents", agentsDoctorValue(paths.root)]] : [],
        ["config", configField(paths)]
      )
    ],
    ["notes", notes]
  );
  return { exit: nodeVersionOk(nodeVersion) ? 0 : 2, text: emit(doc) };
}

// src/setup/prompt.ts
import readline2 from "node:readline";
function readHidden(promptText, io) {
  return new Promise((resolve) => {
    const rl = readline2.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    rl._writeToOutput = (s) => {
      if (s === promptText) io.output.write(s);
    };
    rl.question(promptText, (answer) => {
      rl.close();
      io.output.write("\n");
      resolve(answer);
    });
  });
}
function readLine(promptText, io) {
  return new Promise((resolve) => {
    const rl = readline2.createInterface({ input: io.input, output: io.output, terminal: io.output.isTTY === true });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
function readOneLine(input) {
  return new Promise((resolve, reject) => {
    const rl = readline2.createInterface({ input, terminal: false });
    let resolved = false;
    rl.once("line", (line3) => {
      resolved = true;
      rl.close();
      resolve(line3);
    });
    rl.once("close", () => {
      if (!resolved) resolve("");
    });
    rl.once("error", reject);
  });
}
async function confirm(promptText, defaultYes, io) {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await readLine(`${promptText} ${suffix} `, io)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

// src/setup/standalone.ts
import { chmodSync as chmodSync2, copyFileSync, existsSync as existsSync12, lstatSync, mkdirSync as mkdirSync6, readdirSync as readdirSync2, readFileSync as readFileSync17, renameSync as renameSync3, rmSync as rmSync5, rmdirSync, writeFileSync as writeFileSync7 } from "node:fs";
import { createHash as createHash3 } from "node:crypto";
import path14 from "node:path";

// src/util/embedded.ts
import { readFileSync as readFileSync16 } from "node:fs";
import path13 from "node:path";
function embeddedFiles() {
  return typeof __MM3_EMBEDDED__ === "undefined" ? void 0 : __MM3_EMBEDDED__;
}
var isStandalone = () => embeddedFiles() !== void 0;
function readPackageFile(packageDir, ...segments) {
  const embedded = embeddedFiles();
  if (embedded === void 0) return readFileSync16(path13.join(packageDir, ...segments), "utf8");
  const text = embedded[segments.join("/")];
  if (text === void 0) throw new Error(`${segments.join("/")} is not embedded in this build`);
  return text;
}
function embeddedUnder(prefix) {
  const embedded = embeddedFiles() ?? {};
  return Object.fromEntries(Object.entries(embedded).filter(([key2]) => key2 === prefix || key2.startsWith(`${prefix}/`)));
}

// src/setup/standalone-hook.ts
import { runInThisContext } from "node:vm";
var HOOK_ARG = "__hook";
var isHookLaunch = (argv) => isStandalone() && argv[2] === HOOK_ARG;
function runEmbeddedHook() {
  try {
    const code = readPackageFile("", "hooks", "nudge.cjs");
    const wrapper = runInThisContext(`(function (require, process) {${code}
})`, { filename: "mm3-nudge.cjs" });
    wrapper((id) => process.getBuiltinModule(id), process);
  } catch {
    process.exit(0);
  }
}

// src/setup/standalone.ts
var PLUGIN_ROOTS = ["skills"];
var MANIFESTS = [".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", "hooks/hooks.json"];
var standaloneBinPath = (homeDir, platform = process.platform) => path14.join(homeDir, ".local", "bin", platform === "win32" ? "mm3.exe" : "mm3");
var standalonePluginDir = (homeDir) => path14.join(homeDir, ".local", "share", "mm3", "plugin");
var sha = (file) => createHash3("sha256").update(readFileSync17(file)).digest("hex");
function pluginFiles(binPath) {
  const files = { ...embeddedUnder(".claude-plugin") };
  const hookList = embeddedUnder("hooks")["hooks/hooks.json"];
  if (hookList !== void 0) files["hooks/hooks.json"] = hookList;
  for (const root of PLUGIN_ROOTS) Object.assign(files, embeddedUnder(root));
  for (const m2 of MANIFESTS) if (files[m2] === void 0) throw new Error(`${m2} is not embedded in this build`);
  const manifest = JSON.parse(files[".claude-plugin/plugin.json"]);
  const server = manifest.mcpServers?.mm3;
  if (!server) throw new Error("plugin.json has no mm3 MCP server to point at the standalone file");
  server.command = binPath;
  server.args = ["mcp"];
  files[".claude-plugin/plugin.json"] = `${JSON.stringify(manifest, null, 2)}
`;
  const hooks = JSON.parse(files["hooks/hooks.json"]);
  for (const groups of Object.values(hooks.hooks)) for (const group of groups) for (const h of group.hooks) Object.assign(h, { command: binPath, args: [HOOK_ARG] });
  files["hooks/hooks.json"] = `${JSON.stringify(hooks, null, 2)}
`;
  return files;
}
function listFiles(dir, base = dir) {
  if (!existsSync12(dir)) return [];
  return readdirSync2(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? listFiles(path14.join(dir, e.name), base) : [path14.relative(base, path14.join(dir, e.name)).split(path14.sep).join("/")]);
}
function syncDir(dir, files) {
  let changed = 0;
  for (const [rel, text] of Object.entries(files)) {
    const file = path14.join(dir, ...rel.split("/"));
    if (existsSync12(file) && readFileSync17(file, "utf8") === text) continue;
    mkdirSync6(path14.dirname(file), { recursive: true });
    writeFileSync7(file, text);
    changed += 1;
  }
  for (const rel of listFiles(dir)) {
    if (files[rel] === void 0) {
      rmSync5(path14.join(dir, ...rel.split("/")), { force: true });
      changed += 1;
    }
  }
  pruneEmpty(dir);
  return changed;
}
function pruneEmpty(dir) {
  if (!existsSync12(dir)) return;
  for (const e of readdirSync2(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path14.join(dir, e.name));
  if (readdirSync2(dir).length === 0) rmdirSync(dir);
}
function installBinary(self, target, installedVersion, version) {
  try {
    const exists = existsSync12(target);
    if (exists && sha(target) === sha(self)) return { status: "already", text: `already installed as ${target} (${version})` };
    mkdirSync6(path14.dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}`;
    copyFileSync(self, tmp);
    chmodSync2(tmp, 493);
    renameSync3(tmp, target);
    const how2 = !exists ? "installed" : installedVersion === version ? `replaced (same version ${version}, different build)` : `updated ${installedVersion ?? "an earlier build"} \u2192 ${version}`;
    return { status: "done", text: `${how2} (${target})` };
  } catch (e) {
    return { status: "problem", text: `could not place the standalone at ${target} \u2192 ${e.message}` };
  }
}
function installPluginDir(dir, binPath) {
  try {
    const changed = syncDir(dir, pluginFiles(binPath));
    return changed === 0 ? { status: "already", text: `plugin folder already current (${dir})` } : { status: "done", text: `plugin folder written (${dir})` };
  } catch (e) {
    return { status: "problem", text: `could not write the plugin folder ${dir} \u2192 ${e.message}` };
  }
}
var isLink = (file) => {
  try {
    return lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
};
function removeStandalone(binPath, pluginDir) {
  const left = [];
  for (const target of [binPath, pluginDir]) {
    if (target === binPath && isLink(target)) continue;
    try {
      rmSync5(target, { recursive: true, force: true });
    } catch {
    }
    if (existsSync12(target)) left.push(target);
  }
  const share = path14.dirname(pluginDir);
  if (existsSync12(share) && readdirSync2(share).length === 0) rmdirSync(share);
  return left;
}

// src/setup/init.ts
var GLYPH = { done: "\u2714", already: "\xB7", skipped: "\u2013", problem: "\u2716" };
var line = (status, label, text) => `${GLYPH[status]} ${label}: ${text}`;
var nowIso = (ctx) => (ctx.now ?? (() => (/* @__PURE__ */ new Date()).toISOString()))();
var firstLine = (s) => s.trim().split("\n")[0] ?? "";
function failed(what, r, fallback) {
  const missing = /spawnSync (\S+) ENOENT/.exec(r.stderr)?.[1];
  if (missing) return `${what} failed (${missing} was not found on PATH) \u2192 install ${missing === "npm" ? "Node.js, which includes npm" : missing}, then re-run "mm3 init"`;
  return `${what} failed \u2192 ${firstLine(r.stderr) || fallback}`;
}
var insideGitProject = (cwd) => existsSync13(path15.join(cwd, ".git"));
function isPackageBin(binPath, pkgName) {
  try {
    let dir = path15.dirname(realpathSync2(binPath));
    for (let i = 0; i < 6; i++) {
      const pj = path15.join(dir, "package.json");
      if (existsSync13(pj)) {
        const meta = JSON.parse(readFileSync18(pj, "utf8"));
        return meta.name === pkgName;
      }
      const up = path15.dirname(dir);
      if (up === dir) return false;
      dir = up;
    }
  } catch {
    return false;
  }
  return false;
}
function defaultMode(cwd, prefixWritable) {
  if (existsSync13(path15.join(cwd, "package.json"))) return "local";
  return prefixWritable ? "global" : "user";
}
function isNpxCache(binPath) {
  return binPath.split(path15.sep).includes("_npx");
}
function npmCopy(ctx) {
  const bin = standaloneBinPath(ctx.homeDir, ctx.platform);
  try {
    if (lstatSync2(bin).isSymbolicLink()) return `${bin} -> ${readlinkSync(bin)}`;
  } catch {
  }
  const onPath = findOnPath("mm3", ctx.env, ctx.platform);
  if (onPath && !isNpxCache(onPath) && isPackageBin(onPath, ctx.pkg.name)) return onPath;
  const record2 = readInstallRecord(ctx.env);
  if (record2?.mode === "local" && record2.projectDir && existsSync13(path15.join(record2.projectDir, "node_modules", ".bin", "mm3"))) return `npx mm3 in ${record2.projectDir}`;
  return void 0;
}
function standaloneCopy(ctx) {
  const bin = standaloneBinPath(ctx.homeDir, ctx.platform);
  const record2 = readInstallRecord(ctx.env);
  if (record2?.mode === "standalone" && existsSync13(record2.binPath ?? bin)) return record2.binPath ?? bin;
  try {
    if (lstatSync2(bin).isFile() && !isPackageBin(bin, ctx.pkg.name)) return bin;
  } catch {
  }
  return void 0;
}
function stepCliStandalone(flags, ctx) {
  const npm = npmCopy(ctx);
  if (npm) return { lines: [line("already", "cli", `mm3 is already installed from npm (${npm}) \u2192 kept, not replaced; to switch to the standalone run "mm3 uninstall --all", then this file's init`)], deferred: true };
  return { lines: placeStandalone(flags, ctx), deferred: false };
}
function placeStandalone(flags, ctx) {
  if (flags.mode && flags.mode !== "user") {
    return [line("problem", "cli", `the standalone installs per user, into ~/.local/bin \u2192 drop --${flags.mode}, or run "mm3 init --user"`)];
  }
  const binPath = standaloneBinPath(ctx.homeDir, ctx.platform);
  const pluginDir = standalonePluginDir(ctx.homeDir);
  const record2 = readInstallRecord(ctx.env);
  const placed = installBinary(process.execPath, binPath, record2?.mode === "standalone" ? record2.version : void 0, ctx.pkg.version);
  if (placed.status === "problem") return [line("problem", "cli", placed.text)];
  const folder = installPluginDir(pluginDir, binPath);
  if (folder.status === "problem") return [line("done", "cli", placed.text), line("problem", "cli", folder.text)];
  const lines = [line(placed.status, "cli", placed.text), line(folder.status, "cli", folder.text)];
  if (record2?.mode !== "standalone" || record2.binPath !== binPath || record2.version !== ctx.pkg.version) {
    writeInstallRecord(ctx.env, { mode: "standalone", binPath, pluginDir, version: ctx.pkg.version, installedAt: nowIso(ctx) });
  }
  const bin = path15.dirname(binPath);
  if (!(ctx.env.PATH ?? "").split(path15.delimiter).includes(bin)) lines.push(line("problem", "cli", `${bin} is not on PATH \u2192 add this to your shell profile: export PATH="${bin}:$PATH"`));
  return lines;
}
async function stepCli(flags, ctx) {
  if (isStandalone()) return stepCliStandalone(flags, ctx);
  const standalone = standaloneCopy(ctx);
  if (standalone) return { lines: [line("already", "cli", `mm3 is already installed as the standalone (${standalone}) \u2192 kept, not replaced; to switch to npm run "mm3 uninstall --all", then init again`)], deferred: true };
  return { lines: await stepCliNpm(flags, ctx), deferred: false };
}
async function stepCliNpm(flags, ctx) {
  const onPath = findOnPath("mm3", ctx.env, ctx.platform);
  if (onPath && !isNpxCache(onPath) && isPackageBin(onPath, ctx.pkg.name) && !flags.mode) {
    return [line("already", "cli", `already reachable as ${onPath}`)];
  }
  const prefix = npmGlobalPrefix(ctx.runner);
  const globalWritable = prefix ? isWritableDir(prefix) : false;
  const mode = flags.mode ?? defaultMode(ctx.cwd, globalWritable);
  const self = detectSelfSpec(ctx.packageDir, ctx.pkg);
  if (mode === "global") {
    if (!globalWritable) {
      return [line("problem", "cli", 'the global npm prefix needs sudo \u2192 re-run "mm3 init --user" instead (never runs sudo for you)')];
    }
    const r2 = ctx.runner("npm", ["install", "-g", self.spec]);
    if (r2.status !== 0) return [line("problem", "cli", failed(`npm install -g ${self.spec}`, r2, "see npm's own output"))];
    writeInstallRecord(ctx.env, { mode: "global", npmPrefix: prefix, installedAt: nowIso(ctx) });
    return [line("done", "cli", `installed --global (npm prefix ${prefix})`)];
  }
  if (mode === "user") {
    const userPrefix = path15.join(ctx.homeDir, ".local");
    const r2 = ctx.runner("npm", ["install", "-g", "--prefix", userPrefix, self.spec]);
    if (r2.status !== 0) return [line("problem", "cli", failed(`npm install -g --prefix ${userPrefix} ${self.spec}`, r2, "see npm's own output"))];
    writeInstallRecord(ctx.env, { mode: "user", npmPrefix: userPrefix, installedAt: nowIso(ctx) });
    const bin = path15.join(userPrefix, "bin");
    const onPathNow = (ctx.env.PATH ?? "").split(path15.delimiter).includes(bin);
    const lines = [line("done", "cli", `installed --user (npm prefix ${userPrefix})`)];
    if (!onPathNow) lines.push(line("problem", "cli", `${bin} is not on PATH \u2192 add this to your shell profile: export PATH="${bin}:$PATH"`));
    return lines;
  }
  const r = ctx.runner("npm", ["install", "-D", self.spec]);
  if (r.status !== 0) return [line("problem", "cli", failed(`npm install -D ${self.spec}`, r, "see npm's own output"))];
  writeInstallRecord(ctx.env, { mode: "local", projectDir: ctx.cwd, installedAt: nowIso(ctx) });
  return [line("done", "cli", `installed --local (run it as npx mm3, in ${ctx.cwd})`)];
}
async function stepKey(flags, ctx) {
  if (flags.key === "no") return [line("skipped", "key", "skipped (--no-key)")];
  if (flags.key === "ask") {
    const existing = resolveJevConfig(ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env) });
    if (hasKey(existing)) {
      const replace = flags.yes ? false : await confirm(`A key already resolves (from ${existing.keySource}). Replace it?`, false, ctx.io);
      if (!replace) return [line("already", "key", `already set (from ${existing.keySource})`)];
    }
  }
  let secret;
  if (flags.key === "stdin") {
    if (!ctx.keyStdin) return [line("skipped", "key", "skipped (--key-stdin given but nothing to read from)")];
    secret = (await readOneLine(ctx.keyStdin)).trim();
  } else if (flags.yes) {
    secret = "";
  } else {
    secret = (await readHidden("Paste your TypeSafe API key (input hidden; Enter to skip and use the free fake provider): ", ctx.io)).trim();
  }
  if (!secret) return [line("skipped", "key", "skipped (no key entered \u2014 the free fake provider will be used)")];
  if (/\s/u.test(secret)) return [line("problem", "key", "the pasted value has whitespace in it \u2192 paste just the key, with nothing else")];
  if (secret.includes("'")) return [line("problem", "key", "the pasted value contains a single quote, which the user file can't represent \u2192 use a key without one")];
  let provider = "typesafe";
  if (flags.key === "ask" && !flags.yes) {
    const answer = (await readLine("Which provider is this key for? [typesafe/gateway] (default: typesafe): ", ctx.io)).trim().toLowerCase();
    if (answer === "gateway") provider = "gateway";
  }
  const stored = storeKey(ctx.runner, ctx.platform, ctx.env, provider, secret);
  return [line("done", "key", `stored in ${stored.detail} \u2014 checked on first real call`)];
}
async function stepPlugin(flags, ctx, deferred) {
  if (flags.claude === false) return [line("skipped", "plugin", "skipped (--no-claude)")];
  const claudeOnPath = findOnPath("claude", ctx.env, ctx.platform) !== void 0;
  if (flags.claude !== true && !claudeOnPath) return [line("skipped", "plugin", "skipped (claude not found on PATH)")];
  const lines = [];
  if (!marketplaceExists(ctx.runner)) {
    if (deferred) return [line("skipped", "plugin", 'skipped (the plugin folder belongs to the other install: run its "mm3 init" to register it)')];
    const r2 = addMarketplace(ctx.runner, isStandalone() ? standalonePluginDir(ctx.homeDir) : ctx.packageDir);
    lines.push(r2.status === 0 ? line("done", "plugin", "added the mvp-scale marketplace") : line("problem", "plugin", `could not add the mvp-scale marketplace \u2192 ${firstLine(r2.stderr)}`));
  } else {
    lines.push(line("already", "plugin", "mvp-scale marketplace already added"));
  }
  const scope = flags.scope ?? "project";
  const status = pluginStatus(ctx.runner);
  if (status.installed && status.scopes.includes(scope)) {
    lines.push(line("already", "plugin", `mm3@mvp-scale already installed (${scope} scope)`));
    return lines;
  }
  const r = installPlugin(ctx.runner, scope);
  lines.push(r.status === 0 ? line("done", "plugin", `installed mm3@mvp-scale (${scope} scope)`) : line("problem", "plugin", `could not install the plugin \u2192 ${firstLine(r.stderr)}`));
  return lines;
}
function stepProject(ctx) {
  const paths = pathsFor(ctx.cwd);
  const already = existsSync13(paths.dir);
  ensureDir(paths);
  return [line(already ? "already" : "done", "project", `${already ? "already has" : "created"} .mm3/ (self-ignoring: .mm3/.gitignore)`)];
}
async function runAgentsStep(flags, ctx) {
  const root = ctx.env.MM3_HOME?.trim() || ctx.cwd;
  if (!insideGitProject(root)) return [line("skipped", "agents", 'not in a git project \u2192 cd into one and run "mm3 init --agents" there')];
  const plan = planAgents(root);
  if (plan.problem) return [line("problem", "agents", plan.problem)];
  if (plan.edits.length === 0) return [line("already", "agents", "already set up (AGENTS.md has the mm3 block; CLAUDE.md imports it) \u2014 nothing changed")];
  const preview = plan.edits.map((e) => `agents: will ${e.verb} ${e.file}:
${e.written}`).join("\n\n");
  const interactive = !flags.yes && ctx.io.input.isTTY === true;
  let go = flags.yes;
  if (interactive) {
    ctx.io.output.write(`${preview}

`);
    go = await confirm("Write these?", false, ctx.io);
  }
  const shown2 = interactive ? [] : [preview, ""];
  if (!go) {
    return [...shown2, line("skipped", "agents", `nothing written${flags.yes || interactive ? "" : " \u2192 re-run with --yes to write these"}`)];
  }
  for (const e of plan.edits) {
    const file = path15.join(root, e.file);
    mkdirSync7(path15.dirname(file), { recursive: true });
    writeFileSync8(file, e.content);
  }
  return [...shown2, ...plan.edits.map((e) => line("done", "agents", e.done))];
}
var NOT_A_PROJECT = line("skipped", "project", 'not in a git project \u2192 cd into one and run "mm3 init" there to enable MM3 for it');
async function runInit(flags, ctx) {
  if (flags.agents) {
    const out = await runAgentsStep(flags, ctx);
    return { exit: out.some((l) => l.startsWith(GLYPH.problem)) ? 1 : 0, text: `${out.join("\n")}
` };
  }
  const lines = [];
  const cli = await stepCli(flags, ctx);
  lines.push(...cli.lines);
  lines.push(...await stepKey(flags, ctx));
  const inProject = insideGitProject(ctx.cwd);
  if (inProject) {
    lines.push(...await stepPlugin(flags, ctx, cli.deferred));
    lines.push(...stepProject(ctx));
  } else {
    lines.push(NOT_A_PROJECT);
  }
  const doctorOut = runDoctor(ctx.env, inProject ? pathsFor(ctx.cwd) : void 0, process.version, {
    resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
    runner: ctx.runner,
    platform: ctx.platform
  });
  const partial = lines.some((l) => l.startsWith(GLYPH.problem));
  const next = partial ? 'next: not usable yet \u2014 fix the \u2716 line(s) above, then re-run "mm3 init"' : 'next: run "mm3 agent" for the rules and good/bad patterns before your first request, or "mm3 template class" to start by hand';
  const failedStep = lines.some((l) => l.startsWith(GLYPH.problem) && !l.includes(" is not on PATH \u2192 add "));
  return { exit: failedStep ? 1 : 0, text: `${lines.join("\n")}

${doctorOut.text}
${next}
` };
}

// src/setup/runner.ts
import { execFileSync } from "node:child_process";
var DEFAULT_TIMEOUT_MS2 = 5e3;
var realRunner = (cmd, args2, opts = {}) => {
  try {
    const stdout = execFileSync(cmd, [...args2], {
      input: opts.input ?? "",
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS2,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err2 = e;
    return { status: typeof err2.status === "number" ? err2.status : 1, stdout: err2.stdout ?? "", stderr: err2.stderr ?? err2.message ?? "" };
  }
};

// src/setup/uninstall.ts
import { existsSync as existsSync14, realpathSync as realpathSync3, rmSync as rmSync6 } from "node:fs";
import path16 from "node:path";
var GLYPH2 = { done: "\u2714", already: "\xB7", skipped: "\u2013", problem: "\u2716" };
var line2 = (status, label, text) => `${GLYPH2[status]} ${label}: ${text}`;
async function ask(promptText, defaultAnswer, flags, io) {
  return flags.yes ? defaultAnswer : confirm(promptText, defaultAnswer, io);
}
function detectInstallMode(ctx) {
  const onPath = findOnPath("mm3", ctx.env, ctx.platform);
  if (!onPath) return void 0;
  let real2;
  try {
    real2 = realpathSync3(onPath);
  } catch {
    real2 = onPath;
  }
  const under = (dir) => real2 === dir || real2.startsWith(dir.endsWith(path16.sep) ? dir : `${dir}${path16.sep}`);
  if (under(path16.join(ctx.cwd, "node_modules"))) return { mode: "local", projectDir: ctx.cwd };
  const globalPrefix = npmGlobalPrefix(ctx.runner);
  if (globalPrefix && under(globalPrefix)) return { mode: "global", npmPrefix: globalPrefix };
  const userPrefix = path16.join(ctx.homeDir, ".local");
  if (under(userPrefix)) return { mode: "user", npmPrefix: userPrefix };
  return void 0;
}
async function stepPlugin2(flags, ctx, manual) {
  const status = pluginStatus(ctx.runner);
  const scopesToRemove = flags.all ? status.scopes : status.scopes.filter((s) => s === "project");
  const marketplace = flags.all && marketplaceExists(ctx.runner);
  const cacheDirExists = flags.all && existsSync14(pluginCacheDir(ctx.homeDir));
  if (!scopesToRemove.length && !marketplace && !cacheDirExists) return [line2("already", "plugin", "nothing to remove here")];
  const manualCmds = [
    ...scopesToRemove.map((s) => `claude plugin uninstall mm3@mvp-scale --scope ${s}`),
    ...marketplace ? ["claude plugin marketplace remove mvp-scale"] : [],
    ...cacheDirExists ? [`rm -rf ${pluginCacheDir(ctx.homeDir)}`] : []
  ];
  const found = [
    scopesToRemove.length ? `mm3@mvp-scale at ${scopesToRemove.join(", ")} scope` : "",
    marketplace ? "the mvp-scale marketplace" : "",
    cacheDirExists ? "a leftover plugin cache dir" : ""
  ].filter(Boolean).join(", ");
  const remove = await ask(`Found ${found}. Remove ${flags.all ? "all of it" : "it"}?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`plugin: ${manualCmds.join(" \xB7 ")}`);
    return [line2("skipped", "plugin", "skipped (kept)")];
  }
  const lines = [];
  for (const scope of scopesToRemove) {
    const r = uninstallPlugin(ctx.runner, scope);
    if (r.status === 0) {
      lines.push(line2("done", "plugin", `uninstalled mm3@mvp-scale (${scope} scope)`));
    } else {
      lines.push(line2("problem", "plugin", `could not uninstall (${scope} scope)`));
      manual.push(`plugin (${scope} scope): claude plugin uninstall mm3@mvp-scale --scope ${scope}`);
    }
  }
  if (marketplace) {
    const r = removeMarketplace(ctx.runner);
    if (r.status === 0) {
      lines.push(line2("done", "plugin", "removed the mvp-scale marketplace"));
    } else {
      lines.push(line2("problem", "plugin", "could not remove the mvp-scale marketplace"));
      manual.push("marketplace: claude plugin marketplace remove mvp-scale");
    }
  }
  if (flags.all) {
    if (removePluginCacheDir(ctx.homeDir)) lines.push(line2("done", "plugin", "removed the plugin cache dir"));
    else lines.push(line2("already", "plugin", "no plugin cache dir left behind"));
  }
  return lines;
}
async function stepKey2(flags, ctx, manual) {
  if (!flags.all) return [line2("skipped", "key", "skipped (per-user; use --all to remove it)")];
  if (flags.keepKey) return [line2("skipped", "key", "skipped (--keep-key)")];
  const found = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (!found) return [line2("already", "key", "nothing stored")];
  const remove = await ask(`Found a stored key (${found.source === "keychain" ? "OS keychain" : "the env file"}). Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push("key: remove it by hand \u2014 the OS keychain entry, and/or TYPESAFE_API_KEY/AI_GATEWAY_API_KEY in the env file mm3 init wrote");
    return [line2("skipped", "key", "skipped (kept)")];
  }
  const { removed } = removeStoredKey(ctx.runner, ctx.platform, ctx.env);
  const lines = [line2("done", "key", `removed from ${removed.length ? removed.join(" and ") : "nowhere (already gone)"}`)];
  const stillThere = resolveStoredKey(ctx.runner, ctx.platform, ctx.env);
  if (stillThere) {
    lines.push(line2("problem", "key", `still resolves from ${stillThere.source} \u2192 could not remove it automatically`));
    manual.push(`key: still in the ${stillThere.source === "keychain" ? "OS keychain" : "env file"} \u2014 remove it by hand`);
  }
  return lines;
}
async function stepData(flags, ctx, manual) {
  if (flags.keepData) return [line2("skipped", "project", "skipped (--keep-data)")];
  const dir = `${ctx.cwd}/.mm3`;
  if (!existsSync14(dir)) return [line2("already", "project", "no .mm3/ here")];
  const remove = flags.yes ? false : await confirm("Remove this project's .mm3/ (your run history)? This cannot be undone.", false, ctx.io);
  if (!remove) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line2("skipped", "project", "kept .mm3/ (default: no)")];
  }
  try {
    rmSync6(dir, { recursive: true, force: true });
  } catch {
  }
  if (existsSync14(dir)) {
    manual.push(`project data: rm -rf ${dir}`);
    return [line2("problem", "project", `could not remove ${dir} \u2192 remove it by hand: rm -rf ${dir}`)];
  }
  return [line2("done", "project", "removed .mm3/")];
}
async function stepCliStandalone2(binPath, pluginDir, flags, ctx, manual) {
  const remove = await ask(`Found the standalone installed at ${binPath}. Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`cli: the standalone is at ${binPath} (plugin folder ${pluginDir}) \u2014 remove them yourself when ready`);
    return [line2("skipped", "cli", "skipped (kept)")];
  }
  const left = removeStandalone(binPath, pluginDir);
  if (left.length) {
    manual.push(`cli: rm -rf ${left.join(" ")}`);
    return [line2("problem", "cli", `could not remove ${left.join(" and ")} \u2192 remove ${left.length > 1 ? "them" : "it"} by hand: rm -rf ${left.join(" ")}`)];
  }
  clearInstallRecord(ctx.env);
  const lines = [line2("done", "cli", "uninstalled (was standalone)")];
  const stillOnPath = findOnPath("mm3", ctx.env, ctx.platform);
  if (stillOnPath) {
    lines.push(line2("problem", "cli", `still resolves on PATH at ${stillOnPath} \u2192 a stale PATH entry or a second copy elsewhere; remove it by hand if a shell still finds it`));
    manual.push(`cli: still on PATH at ${stillOnPath} \u2014 check for a second install or a stale shell hash`);
  }
  return lines;
}
async function stepCli2(flags, ctx, manual) {
  if (!flags.all) return [line2("skipped", "cli", "skipped (per-user; use --all to remove it)")];
  const record2 = readInstallRecord(ctx.env);
  if (record2?.mode === "standalone") return stepCliStandalone2(record2.binPath ?? standaloneBinPath(ctx.homeDir, ctx.platform), record2.pluginDir ?? standalonePluginDir(ctx.homeDir), flags, ctx, manual);
  const detected = record2 ? void 0 : detectInstallMode(ctx);
  const loc = record2 ?? detected;
  if (!loc) {
    const cmds = `npm uninstall -g ${ctx.pkgName} \xB7 npm uninstall -g --prefix ~/.local ${ctx.pkgName} \xB7 npm uninstall -D ${ctx.pkgName} (in your project)`;
    manual.push(`cli: don't know how this was installed \u2014 try: ${cmds}`);
    return [line2("problem", "cli", `don't know how this was installed \u2192 run one of: ${cmds}`)];
  }
  const guessedNote = record2 ? "" : " (guessed from its own path on PATH \u2014 no install record found)";
  const remove = await ask(`Found the CLI installed --${loc.mode}${guessedNote}. Remove it?`, true, flags, ctx.io);
  if (!remove) {
    manual.push(`cli: was installed --${loc.mode} \u2014 remove it yourself when ready`);
    return [line2("skipped", "cli", "skipped (kept)")];
  }
  const args2 = loc.mode === "global" ? ["uninstall", "-g", ctx.pkgName] : loc.mode === "user" ? ["uninstall", "-g", "--prefix", loc.npmPrefix ?? "", ctx.pkgName] : ["uninstall", ctx.pkgName];
  const r = ctx.runner("npm", args2);
  if (r.status !== 0) {
    manual.push(`cli: npm ${args2.join(" ")}`);
    return [line2("problem", "cli", `npm ${args2.join(" ")} failed \u2192 ${r.stderr.trim().split("\n")[0] ?? "see npm's own output"}`)];
  }
  clearInstallRecord(ctx.env);
  const lines = [line2("done", "cli", `uninstalled (was --${loc.mode}${guessedNote})`)];
  const stillOnPath = findOnPath("mm3", ctx.env, ctx.platform);
  if (stillOnPath) {
    lines.push(line2("problem", "cli", `still resolves on PATH at ${stillOnPath} \u2192 a stale PATH entry or a second copy elsewhere; remove it by hand if a shell still finds it`));
    manual.push(`cli: still on PATH at ${stillOnPath} \u2014 check for a second install or a stale shell hash`);
  }
  return lines;
}
async function runUninstall(flags, ctx) {
  const manual = [];
  const lines = [];
  lines.push(...await stepPlugin2(flags, ctx, manual));
  lines.push(...await stepData(flags, ctx, manual));
  lines.push(...await stepKey2(flags, ctx, manual));
  lines.push(...await stepCli2(flags, ctx, manual));
  if (manual.length) {
    lines.push("", "manual backup \u2014 finish these by hand if you want to:", ...manual.map((m2) => `  - ${m2}`));
  }
  return { exit: 0, text: `${lines.join("\n")}
` };
}

// src/contract/grade.ts
var BAR = 0.7;
var EPS = 1e-9;
function passingProbability(cat, a) {
  if (a.kind === "yesno") return cat.pass === "no" ? 1 - a.p : a.p;
  const passing = Array.isArray(cat.pass) ? cat.pass : [];
  return passing.reduce((sum, o) => sum + (a.dist[o] ?? 0), 0);
}
function markOf(pp) {
  if (pp >= BAR - EPS) return "pass";
  if (pp <= 1 - BAR + EPS) return "miss";
  return "mid";
}
function gateOf(need, marks) {
  const n = marks.length;
  const pass = marks.filter((x) => x === "pass").length;
  const miss = marks.filter((x) => x === "miss").length;
  if (n === 0) return "unsure";
  if (need === "any") return pass > 0 ? "pass" : miss === n ? "fail" : "unsure";
  if (miss > 0) return "fail";
  if (need === "most") return pass * 3 >= 2 * n ? "pass" : "unsure";
  return pass === n ? "pass" : "unsure";
}
function combine(gates) {
  if (gates.includes("fail")) return "fail";
  return gates.every((g) => g === "pass") ? "pass" : "unsure";
}
function goalGate(p) {
  const mark = markOf(p);
  return mark === "pass" ? "pass" : mark === "miss" ? "fail" : "unsure";
}
function shown(a) {
  if (a.kind === "yesno") return a.p;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => e[1] > best[1] ? e : best);
  return { top, p };
}
function severityOf(q, a) {
  if (q.kind !== "scale" || a.kind !== "scale") return 0;
  const [top, p] = Object.entries(a.dist).reduce((best, e) => e[1] > best[1] ? e : best);
  const level = q.levels.indexOf(top);
  return level < 0 ? 0 : level * p;
}
function gradeCategory(cat, answerOf) {
  const marks = /* @__PURE__ */ new Map();
  const values = /* @__PURE__ */ new Map();
  let severity = 0;
  for (const q of cat.questions) {
    const a = answerOf(q.n);
    if (!a) continue;
    marks.set(q.n, markOf(passingProbability(cat, a)));
    values.set(q.n, shown(a));
    severity = Math.max(severity, severityOf(q, a));
  }
  return { name: cat.name, gate: gateOf(cat.need, [...marks.values()]), marks, values, severity };
}
function gradeSubject(categories, answers, prefix = "") {
  const grades = categories.map((c) => gradeCategory(c, (n) => answers[`${prefix}${n}`]));
  const g = answers[`${prefix}goal`];
  const goal = g && g.kind === "yesno" ? { gate: goalGate(g.p), p: g.p } : void 0;
  return { gate: combine([...goal ? [goal.gate] : [], ...grades.map((c) => c.gate)]), ...goal ? { goal } : {}, categories: grades };
}
function gradeItems(items, categoriesOf, statusOf, answers) {
  const kids = /* @__PURE__ */ new Map();
  for (const it of items) if (it.parent !== null) kids.set(it.parent, [...kids.get(it.parent) ?? [], it.id]);
  const out = /* @__PURE__ */ new Map();
  for (const it of [...items].reverse()) {
    const status = statusOf(it.id);
    const graded = status === "asked" || status === "reused";
    const own = graded ? categoriesOf(it.layer).map((c) => gradeCategory(c, (n) => answers[`${it.id}#${n}`])) : [];
    const ownGate = status === "skipped" ? "unsure" : combine(own.map((c) => c.gate));
    const severity = own.reduce((worst, c) => Math.max(worst, c.severity), 0);
    const children = (kids.get(it.id) ?? []).map((k) => out.get(k).gate);
    out.set(it.id, { id: it.id, layer: it.layer, parent: it.parent, status, own, ownGate, gate: combine([ownGate, ...children]), severity });
  }
  return new Map([...out].reverse());
}
function sweepGate(goal, grades) {
  const tops = [...grades.values()].filter((g) => g.parent === null || !grades.has(g.parent));
  return combine([goal, ...tops.map((g) => g.gate)]);
}
function worstFirst(grades) {
  const count = (g, gate) => g.own.filter((c) => c.gate === gate).length;
  return [...grades].filter((g) => (g.status === "asked" || g.status === "reused") && g.ownGate !== "pass").map((g, i) => ({ g, i })).sort((a, b) => (b.g.severity ?? 0) - (a.g.severity ?? 0) || count(b.g, "fail") - count(a.g, "fail") || count(b.g, "unsure") - count(a.g, "unsure") || a.i - b.i).map(({ g }) => g);
}

// src/contract/translate.ts
import { createHash as createHash4 } from "node:crypto";
function asked(q, id, text, item) {
  return {
    id,
    n: q.n,
    kind: q.kind,
    text,
    ...item !== void 0 ? { item } : {},
    ...q.kind === "scale" ? { levels: q.levels } : {},
    ...q.kind === "choice" ? { options: q.options } : {}
  };
}
var byNumber = (categories) => categories.flatMap((c) => c.questions).sort((a, b) => a.n - b.n);
var goalQuestion = (goal) => ({ id: "goal", n: null, kind: "yesno", text: goal });
function subjectQuestions(categories, prefix = "") {
  return byNumber(categories).map((q) => asked(q, `${prefix}${q.n}`, q.text));
}
function itemQuestions(item, categories) {
  return byNumber(categories).map((q) => asked(q, `${item.id}#${q.n}`, fillBlanks(q.text, item.fill), item.id));
}
function toClassifierQuestion(q) {
  const ask2 = redact(q.text);
  const item = q.item === void 0 ? {} : { item: redact(q.item) };
  if (q.kind === "yesno") return { type: "noul", id: q.id, ask: ask2, ...item };
  if (q.kind === "scale") return { type: "score", id: q.id, ask: ask2, levels: q.levels ?? [], ...item };
  return { type: "choice", id: q.id, ask: ask2, options: Object.fromEntries((q.options ?? []).map((o) => [o, o])), ...item };
}
function answerKey(evidence, q) {
  return createHash4("sha256").update(JSON.stringify([evidence, q.kind, q.text, q.levels ?? q.options ?? null])).digest("hex").slice(0, 32);
}
function subjectEvidence(files) {
  return JSON.stringify(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
var ITEM_LIMITS = DEFAULT_CONFIG.evidence;
function itemsState(items, notes, limits = ITEM_LIMITS) {
  const out = {};
  let total = 0;
  for (const it of items) {
    const id = redact(it.id);
    let text = redact(it.text);
    if (text.length > limits.perItemChars) {
      text = text.slice(0, limits.perItemChars);
      notes.push(`${id} truncated to ${limits.perItemChars} chars`);
    }
    const room = limits.totalChars - total;
    if (room <= 0) {
      out[id] = "";
      notes.push(`${id} not shown: evidence limit reached`);
      continue;
    }
    if (text.length > room) {
      text = text.slice(0, room);
      notes.push(`${id} truncated: evidence limit reached`);
    }
    total += text.length;
    out[id] = text;
  }
  return out;
}

// src/evidence/git.ts
import { spawnSync } from "node:child_process";
import { closeSync as closeSync6, fstatSync as fstatSync6, openSync as openSync6, readFileSync as readFileSync20, realpathSync as realpathSync5 } from "node:fs";
import path19 from "node:path";

// src/evidence/code.ts
import { closeSync as closeSync5, fstatSync as fstatSync5, openSync as openSync5, readFileSync as readFileSync19, realpathSync as realpathSync4 } from "node:fs";
import path18 from "node:path";

// src/evidence/paths.ts
import path17 from "node:path";
var isOutside = (rel) => rel.startsWith("..") || path17.isAbsolute(rel);

// src/evidence/code.ts
var EVIDENCE_LIMITS = { perFileChars: DEFAULT_CONFIG.evidence.perItemChars, totalChars: DEFAULT_CONFIG.evidence.totalChars };
var fmt = (n) => n.toLocaleString("en-US");
var LINES = /^(\d+)(?:-(\d+))?$/;
var TAIL = /:(\d+(?:-\d+)?)$/u;
function lineRange(lines) {
  const m2 = LINES.exec(lines);
  if (!m2) return void 0;
  const start = Number(m2[1]);
  const end = m2[2] === void 0 ? start : Number(m2[2]);
  return start >= 1 && start <= end ? { start, end } : void 0;
}
function splitWhere(entry) {
  const m2 = TAIL.exec(entry);
  return m2 ? { path: entry.slice(0, m2.index), lines: m2[1] } : { path: entry };
}
function readCodeEvidence(root, where, opts = {}) {
  const stopOnOversize = opts.stopOnOversize ?? true;
  const caps = opts.limits ?? EVIDENCE_LIMITS;
  const errors = [];
  const notes = [];
  const files = {};
  let total = 0;
  for (const entry of where) {
    const { path: rawPath, lines } = splitWhere(entry);
    const full = path18.resolve(root, rawPath);
    const rel = path18.relative(root, full);
    const outside = `\u2716 mak.where: "${rawPath}" is outside the project \u2192 use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const range = lines ? lineRange(lines) : void 0;
    if (lines && !range) {
      errors.push(`\u2716 mak.where: "${entry}" has a bad line range \u2192 use start-end with 1 \u2264 start \u2264 end`);
      continue;
    }
    let text;
    let fd;
    try {
      if (isOutside(path18.relative(realpathSync4(root), realpathSync4(full)))) {
        errors.push(outside);
        continue;
      }
      fd = openSync5(full, "r");
      if (fstatSync5(fd).isDirectory()) {
        errors.push(`\u2716 mak.where: "${rawPath}" is a folder \u2192 name a file (scan covers folders)`);
        continue;
      }
      text = readFileSync19(fd, "utf8");
    } catch {
      errors.push(`\u2716 mak.where: cannot read "${rawPath}" \u2192 check the path`);
      continue;
    } finally {
      if (fd !== void 0) closeSync5(fd);
    }
    const shown2 = `${rel.split(path18.sep).join("/")}${lines ? `:${lines}` : ""}`;
    let body = redact(range ? text.split("\n").slice(range.start - 1, range.end).join("\n") : text);
    if (body.length > caps.perFileChars) {
      if (stopOnOversize) {
        if (range) {
          errors.push(`\u2716 mak.where: "${entry}" is ${fmt(range.end - range.start + 1)} lines, too big to send \u2192 narrow the range`);
        } else {
          errors.push(`\u2716 mak.where: "${rawPath}" is ${fmt(text.split("\n").length)} lines, too big to send whole \u2192 name a range (${rawPath}:start-end)`);
        }
        continue;
      }
      body = body.slice(0, caps.perFileChars);
      notes.push(`${shown2} truncated to ${caps.perFileChars} chars`);
    }
    const room = caps.totalChars - total;
    if (room <= 0) {
      if (stopOnOversize) {
        errors.push(`\u2716 mak.where: "${shown2}" doesn't fit \u2014 where: is over ${fmt(caps.totalChars)} chars total \u2192 send fewer paths or narrower ranges`);
        continue;
      }
      notes.push(`${shown2} skipped: evidence limit reached`);
      continue;
    }
    if (body.length > room) {
      if (stopOnOversize) {
        errors.push(`\u2716 mak.where: "${shown2}" doesn't fit \u2014 where: is over ${fmt(caps.totalChars)} chars total \u2192 send fewer paths or narrower ranges`);
        continue;
      }
      body = body.slice(0, room);
      notes.push(`${shown2} truncated: evidence limit reached`);
    }
    total += body.length;
    files[shown2] = body;
  }
  return errors.length ? { ok: false, errors } : { ok: true, evidence: { files, notes } };
}

// src/evidence/git.ts
var FATAL = /fatal: (invalid object name|Path .* does not exist)/u;
var WHOLE_FILE_NOTE = "reading whole files: line ranges may not match the parent run";
var isGitOption = (ref) => ref.startsWith("-");
function gitRootOf(dir, spawn) {
  const result = spawn("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
  const out = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return result.status === 0 && out ? out : void 0;
}
function firstWhereDir(root, wherePaths) {
  const first = wherePaths[0];
  if (!first) return root;
  return path19.dirname(path19.resolve(root, first.split(":")[0]));
}
function resolveRefSha(root, ref, wherePaths, deps) {
  if (ref !== "worktree" && isGitOption(ref)) return null;
  const spawn = deps?.spawn ?? spawnSync;
  const dir = firstWhereDir(root, wherePaths);
  const gitRoot = gitRootOf(dir, spawn) ?? (wherePaths.length ? void 0 : root);
  if (!gitRoot) return null;
  const result = spawn("git", ["rev-parse", ref === "worktree" ? "HEAD" : ref], { cwd: gitRoot, encoding: "utf8" });
  const out = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return result.status === 0 && out ? out : null;
}
function currentCommitSha(root, wherePaths = [], deps) {
  return resolveRefSha(root, "worktree", wherePaths, deps);
}
function repoRootFor(root, wherePaths, deps) {
  const spawn = deps?.spawn ?? spawnSync;
  const dir = firstWhereDir(root, wherePaths);
  return gitRootOf(dir, spawn) ?? (wherePaths.length ? void 0 : root);
}
function listFilesAtRef(repoRoot, ref, deps) {
  if (isGitOption(ref)) return [];
  const spawn = deps?.spawn ?? spawnSync;
  const result = spawn("git", ["ls-tree", "-r", "--name-only", ref], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return [];
  return result.stdout.split("\n").filter(Boolean);
}
function readFileAtRef(repoRoot, ref, relPath, deps) {
  if (isGitOption(ref)) return void 0;
  const spawn = deps?.spawn ?? spawnSync;
  const result = spawn("git", ["show", `${ref}:${relPath}`], { cwd: repoRoot, encoding: "utf8" });
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.status !== 0 || FATAL.test(stderr)) return void 0;
  return typeof result.stdout === "string" ? result.stdout : void 0;
}
function keep(shown2, text, total, notes, caps) {
  let body = redact(text);
  if (body.length > caps.perFileChars) {
    body = body.slice(0, caps.perFileChars);
    notes.push(`${shown2} truncated to ${caps.perFileChars} chars`);
  }
  const room = caps.totalChars - total;
  if (room <= 0) {
    notes.push(`${shown2} skipped: evidence limit reached`);
    return void 0;
  }
  if (body.length > room) {
    body = body.slice(0, room);
    notes.push(`${shown2} truncated: evidence limit reached`);
  }
  return { body, total: total + body.length };
}
function readGitEvidence(root, ref, field, paths, deps) {
  if (ref !== "worktree" && isGitOption(ref)) {
    return { ok: false, errors: [`\u2716 mak.compare.${field}: "${ref}" looks like an option, not a ref \u2192 use a branch, tag or commit`] };
  }
  const spawn = deps?.spawn ?? spawnSync;
  const caps = deps?.limits ?? EVIDENCE_LIMITS;
  const errors = [];
  const notes = [];
  const files = {};
  let total = 0;
  let read3 = false;
  for (const rawPath of paths) {
    const full = path19.resolve(root, rawPath);
    const rel = path19.relative(root, full);
    const outside = `\u2716 mak.compare.${field}: "${rawPath}" is outside the project \u2192 use a path inside the project`;
    if (isOutside(rel)) {
      errors.push(outside);
      continue;
    }
    const shown2 = rel.split(path19.sep).join("/");
    if (ref === "worktree") {
      let text;
      let fd;
      try {
        if (isOutside(path19.relative(realpathSync5(root), realpathSync5(full)))) {
          errors.push(outside);
          continue;
        }
        fd = openSync6(full, "r");
        if (fstatSync6(fd).isDirectory()) {
          errors.push(`\u2716 mak.compare.${field}: "${rawPath}" is a folder \u2192 name a file`);
          continue;
        }
        text = readFileSync20(fd, "utf8");
      } catch {
        errors.push(`\u2716 mak.compare.${field}: cannot read "${rawPath}" \u2192 check the path`);
        continue;
      } finally {
        if (fd !== void 0) closeSync6(fd);
      }
      read3 = true;
      const kept2 = keep(shown2, text, total, notes, caps);
      if (kept2) {
        files[shown2] = kept2.body;
        total = kept2.total;
      }
      continue;
    }
    const gitRoot = gitRootOf(path19.dirname(full), spawn) ?? root;
    const gitRel = path19.relative(gitRoot, full).split(path19.sep).join("/");
    const result = spawn("git", ["show", `${ref}:${gitRel}`], { cwd: gitRoot, encoding: "utf8" });
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    if (result.status !== 0 || FATAL.test(stderr)) {
      errors.push(`\u2716 mak.compare.${field}: "${ref}" not found by git (or the path doesn't exist there) \u2192 check the ref and the path`);
      continue;
    }
    read3 = true;
    const kept = keep(shown2, typeof result.stdout === "string" ? result.stdout : "", total, notes, caps);
    if (kept) {
      files[shown2] = kept.body;
      total = kept.total;
    }
  }
  if (errors.length) return { ok: false, errors };
  if (read3) notes.push(WHOLE_FILE_NOTE);
  return { ok: true, files, notes };
}

// src/evidence/units.ts
import { readFileSync as readFileSync21, realpathSync as realpathSync6 } from "node:fs";
import path21 from "node:path";

// src/evidence/glob.ts
import { readdirSync as readdirSync3 } from "node:fs";
import path20 from "node:path";
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".mm3", "dist"]);
var MAX_FILES = DEFAULT_CONFIG.evidence.maxFiles;
var escape = (s) => s.replace(/[.+^$()|[\]\\]/gu, "\\$&");
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        const slash = pattern[i + 2] === "/";
        re += slash ? "(?:[^/]*/)*" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end > i) {
        re += `(?:${pattern.slice(i + 1, end).split(",").map(escape).join("|")})`;
        i = end;
      } else re += "\\{";
    } else re += escape(c);
  }
  return new RegExp(`^${re}$`, "u");
}
function staticPrefix(pattern) {
  const parts = pattern.split("/");
  const fixed = [];
  for (const p of parts.slice(0, -1)) {
    if (/[*?{]/u.test(p)) break;
    fixed.push(p);
  }
  return fixed.join("/");
}
function expandGlob(root, pattern, maxFiles = MAX_FILES) {
  const clean2 = pattern.replace(/^\.\//u, "");
  if (path20.isAbsolute(clean2) || clean2.split("/").includes("..")) return { files: [], truncated: false };
  const re = globToRegExp(clean2);
  const files = [];
  let truncated = false;
  const rootResolved = path20.resolve(root);
  const walk2 = (rel) => {
    const dir = path20.resolve(root, rel);
    if (dir !== rootResolved && !dir.startsWith(rootResolved + path20.sep)) return;
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk2(child);
      } else if (e.isFile() && re.test(child)) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(child);
      }
    }
  };
  walk2(staticPrefix(clean2));
  return { files, truncated };
}

// src/evidence/split.ts
var KEYWORDS_BEFORE_REGEX = /(?:^|[^\w$])(?:return|typeof|instanceof|case|do|else|in|of|new|delete|void|throw|yield|await)$/u;
function maskCode(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const templates = [];
  let depth = 0;
  const regexAllowed = (i2) => {
    let j = i2 - 1;
    while (j >= 0 && /\s/u.test(out[j])) j--;
    if (j < 0) return true;
    const c = out[j];
    if (/[\w$]/u.test(c)) return KEYWORDS_BEFORE_REGEX.test(out.slice(Math.max(0, j - 12), j + 1).join(""));
    return !/[)\]]/u.test(c);
  };
  const template = (start) => {
    let j = start;
    while (j < n) {
      if (src[j] === "\\") {
        j += 2;
        continue;
      }
      if (src[j] === "`") {
        blank(start, j);
        return j + 1;
      }
      if (src[j] === "$" && src[j + 1] === "{") {
        blank(start, j);
        depth += 1;
        templates.push(depth);
        return j + 2;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
    } else if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "`") {
      i = template(i + 1);
    } else if (c === "/" && regexAllowed(i)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "{") {
      depth += 1;
      i += 1;
    } else if (c === "}") {
      if (templates.length && templates[templates.length - 1] === depth) {
        templates.pop();
        depth -= 1;
        i = template(i + 1);
      } else {
        depth -= 1;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join("");
}
function matching(masked, open) {
  const pairs = { "{": "}", "(": ")", "[": "]" };
  const close = pairs[masked[open]];
  let depth = 0;
  for (let k = open; k < masked.length; k++) {
    if (masked[k] === masked[open]) depth += 1;
    else if (masked[k] === close) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}
function depths(masked) {
  const d = new Int32Array(masked.length + 1);
  let depth = 0;
  for (let k = 0; k < masked.length; k++) {
    d[k] = depth;
    if (masked[k] === "{") depth += 1;
    else if (masked[k] === "}") depth -= 1;
  }
  d[masked.length] = depth;
  return d;
}
var lineAt = (src, index) => {
  let line3 = 1;
  for (let k = 0; k < index && k < src.length; k++) if (src[k] === "\n") line3 += 1;
  return line3;
};
function bodyEnd(masked, paramsOpen) {
  const paramsClose = matching(masked, paramsOpen);
  if (paramsClose < 0) return -1;
  let k = paramsClose + 1;
  let depth = 0;
  while (k < masked.length && !(depth === 0 && (masked[k] === "{" || masked[k] === ";" || masked.startsWith("=>", k)))) {
    if (masked[k] === "(" || masked[k] === "[") depth += 1;
    else if (masked[k] === ")" || masked[k] === "]") depth -= 1;
    k += 1;
  }
  if (masked.startsWith("=>", k)) {
    k += 2;
    while (k < masked.length && /\s/u.test(masked[k])) k += 1;
    if (masked[k] !== "{") return expressionEnd(masked, k);
  }
  if (masked[k] !== "{") return -1;
  return matching(masked, k);
}
function expressionEnd(masked, from) {
  let depth = 0;
  for (let k = from; k < masked.length; k++) {
    const c = masked[k];
    if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) {
      if (depth === 0) return k - 1;
      depth -= 1;
    } else if (depth === 0 && (c === ";" || c === "," || c === "\n")) return k - 1;
  }
  return masked.length - 1;
}
var DECLARATIONS = [
  // function name(  · export function · export default async function* name(
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gu,
  // const name = async (…) =>  · const name = function(  · const name: T = x =>
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:async\s+)?(?:function\b[^(]*\(|(?:<[^>]*>)?\s*\(|[A-Za-z_$][\w$]*\s*=>)/gu,
  // export default function (  (anonymous)
  /export\s+default\s+(?:async\s+)?function\s*\*?\s*()\(/gu
];
var METHOD = /^[ \t]*(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/gmu;
var NOT_METHODS = /* @__PURE__ */ new Set(["if", "for", "while", "switch", "catch", "function", "return", "with"]);
function namedFunctionExprStarts(masked) {
  const starts = /* @__PURE__ */ new Set();
  for (const hit of masked.matchAll(DECLARATIONS[1])) {
    const m2 = /=\s*(?:async\s+)?function\b/u.exec(hit[0]);
    if (m2) starts.add(hit.index + m2.index + m2[0].lastIndexOf("function"));
  }
  return starts;
}
function dedupe(units) {
  const seen = /* @__PURE__ */ new Map();
  return units.map((u) => {
    const k = (seen.get(u.name) ?? 0) + 1;
    seen.set(u.name, k);
    return k === 1 ? u : { ...u, name: `${u.name}~${k}` };
  });
}
function splitFunctions(src) {
  const masked = maskCode(src);
  const depth = depths(masked);
  const skipStarts = namedFunctionExprStarts(masked);
  const found = [];
  const add = (name, at, end) => {
    if (end > at && !found.some((f) => f.at === at)) found.push({ name, at, end });
  };
  for (const re of DECLARATIONS) {
    for (const hit of masked.matchAll(re)) {
      const at = hit.index;
      if (re === DECLARATIONS[0] && skipStarts.has(at)) continue;
      const params = hit[0].trimEnd().endsWith("(") ? at + hit[0].lastIndexOf("(") : at + hit[0].length;
      const end = hit[0].trimEnd().endsWith("=>") ? expressionOrBlock(masked, at + hit[0].length) : bodyEnd(masked, params);
      add(hit[1] || "default", at, end);
    }
  }
  for (const cls of masked.matchAll(/(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/gu)) {
    if (depth[cls.index] !== 0) continue;
    const open = cls.index + cls[0].length - 1;
    const close = matching(masked, open);
    if (close < 0) continue;
    const body = masked.slice(open + 1, close);
    for (const meth of body.matchAll(METHOD)) {
      const at = open + 1 + meth.index;
      const name = meth[1];
      if (NOT_METHODS.has(name) || depth[at + meth[0].length - 1] !== depth[open] + 1) continue;
      const end = bodyEnd(masked, at + meth[0].length - 1);
      if (end > 0) found.push({ name: `${cls[1]}.${name}`, at: at + (meth[0].length - meth[0].trimStart().length), end });
    }
  }
  found.sort((a, b) => a.at - b.at);
  if (!found.length) return [{ name: "(module)", start: 1, end: lineAt(src, src.length), text: src }];
  return dedupe(
    found.map((f) => {
      const lineStart = src.lastIndexOf("\n", f.at) + 1;
      return { name: f.name, start: lineAt(src, f.at), end: lineAt(src, f.end), text: src.slice(lineStart, f.end + 1) };
    })
  );
}
function expressionOrBlock(masked, from) {
  let k = from;
  while (k < masked.length && /\s/u.test(masked[k])) k += 1;
  return masked[k] === "{" ? matching(masked, k) : expressionEnd(masked, k);
}
var NOT_CALLS = /* @__PURE__ */ new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "super", "import", "await", "new", "yield", "void", "delete", "in", "of", "with"]);
var isIdentStart = (c) => c !== void 0 && /[A-Za-z_$]/u.test(c);
var isIdentPart = (c) => c !== void 0 && /[\w$]/u.test(c);
var isSpace = (c) => c !== void 0 && /\s/u.test(c);
function identEnd(masked, at) {
  let k = at + 1;
  while (isIdentPart(masked[k])) k += 1;
  return k;
}
function skipSpace(masked, at) {
  let k = at;
  while (isSpace(masked[k])) k += 1;
  return k;
}
function genericsEnd(masked, at) {
  if (masked[at] !== "<") return -1;
  let k = at + 1;
  while (k < masked.length && !"<>()".includes(masked[k])) k += 1;
  return masked[k] === ">" ? k + 1 : -1;
}
function chainCall(masked, start) {
  const ends = [identEnd(masked, start)];
  let k = ends[0];
  for (; ; ) {
    const j = skipSpace(masked, k);
    let dot = -1;
    if (masked[j] === "?" && masked[j + 1] === ".") dot = j + 2;
    else if (masked[j] === ".") dot = j + 1;
    if (dot < 0) break;
    const afterDot = skipSpace(masked, dot);
    if (!isIdentStart(masked[afterDot])) break;
    k = identEnd(masked, afterDot);
    ends.push(k);
  }
  for (let idx = ends.length - 1; idx >= 0; idx--) {
    const end = ends[idx];
    let j = skipSpace(masked, end);
    const afterGenerics = genericsEnd(masked, j);
    if (afterGenerics >= 0) j = skipSpace(masked, afterGenerics);
    if (masked[j] === "(") return { nameEnd: end, openParen: j };
  }
  return null;
}
function splitCalls(fnSrc) {
  const masked = maskCode(fnSrc);
  const bodyOpen = masked.indexOf("{");
  const units = [];
  const n = masked.length;
  let i = 0;
  while (i < n) {
    if (!isIdentStart(masked[i])) {
      i += 1;
      continue;
    }
    const prev = i > 0 ? masked[i - 1] : void 0;
    if (prev !== void 0 && /[\w$.]/u.test(prev)) {
      i = identEnd(masked, i);
      continue;
    }
    const hit = chainCall(masked, i);
    if (!hit) {
      i = identEnd(masked, i);
      continue;
    }
    if (i > bodyOpen) {
      const name = masked.slice(i, hit.nameEnd).replace(/\s+/gu, "");
      if (!NOT_CALLS.has(name.split(/\??\./u)[0])) {
        const close = matching(masked, hit.openParen);
        const end = close < 0 ? hit.openParen : close;
        const lineStart = fnSrc.lastIndexOf("\n", i) + 1;
        const lineEnd = fnSrc.indexOf("\n", end);
        units.push({ name, start: lineAt(fnSrc, i), end: lineAt(fnSrc, end), text: fnSrc.slice(lineStart, lineEnd < 0 ? fnSrc.length : lineEnd) });
      }
    }
    i = hit.openParen + 1;
  }
  return dedupe(units);
}

// src/evidence/units.ts
var LINES2 = /^(\d+)-(\d+)$/;
function lineRange2(lines) {
  const m2 = LINES2.exec(lines);
  if (!m2) return void 0;
  const start = Number(m2[1]);
  const end = Number(m2[2]);
  return start >= 1 && start <= end ? { start, end } : void 0;
}
function readFiles(root, spec, notes, maxFiles) {
  const { files, truncated } = expandGlob(root, spec, maxFiles);
  if (truncated) notes.push(`${spec}: matched more than ${maxFiles} files, using the first ${maxFiles}`);
  const out = [];
  for (const rel of files) {
    const full = path21.join(root, rel);
    let text;
    try {
      if (isOutside(path21.relative(realpathSync6(root), realpathSync6(full)))) throw new Error("outside");
      text = readFileSync21(full, "utf8");
    } catch {
      notes.push(`${rel}: could not read, skipped`);
      continue;
    }
    const lineCount = text ? text.split("\n").length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: "file", name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}
function readFunctions(parent) {
  const unit = parent.unit;
  return splitFunctions(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: "function", name: u.name, lines: `${u.start}-${u.end}` }
  }));
}
function readCalls(parent) {
  const unit = parent.unit;
  const base = Number(unit.lines.split("-")[0]) - 1;
  return splitCalls(parent.text).map((u) => ({
    name: u.name,
    text: u.text,
    unit: { path: unit.path, kind: "call", name: u.name, lines: `${u.start + base}-${u.end + base}` }
  }));
}
function createCodeResolver(root, notes, maxFiles = MAX_FILES) {
  return (_layer, spec, parent) => {
    if (parent === null) return readFiles(root, spec, notes, maxFiles);
    if (parent.unit.kind === "file") return readFunctions(parent);
    return readCalls(parent);
  };
}
function readFilesAt(root, ref, spec, notes, wherePaths, maxFiles) {
  const clean2 = spec.replace(/^\.\//u, "");
  if (path21.isAbsolute(clean2) || clean2.split("/").includes("..")) return [];
  const repoRoot = repoRootFor(root, wherePaths);
  if (!repoRoot) {
    notes.push(`${spec}: not inside a git repo, matched no files`);
    return [];
  }
  const re = globToRegExp(clean2);
  const matched = [];
  for (const gitRel of listFilesAtRef(repoRoot, ref)) {
    const rel = path21.relative(root, path21.resolve(repoRoot, gitRel)).split(path21.sep).join("/");
    if (isOutside(rel)) continue;
    if (re.test(rel)) matched.push(rel);
  }
  matched.sort();
  const truncated = matched.length > maxFiles;
  if (truncated) notes.push(`${spec}: matched more than ${maxFiles} files, using the first ${maxFiles}`);
  const files = truncated ? matched.slice(0, maxFiles) : matched;
  const out = [];
  for (const rel of files) {
    const gitRel = path21.relative(repoRoot, path21.resolve(root, rel)).split(path21.sep).join("/");
    const text = readFileAtRef(repoRoot, ref, gitRel);
    if (text === void 0) {
      notes.push(`${rel}: could not read at ${ref}, skipped`);
      continue;
    }
    const lineCount = text ? text.split("\n").length : 1;
    out.push({ name: rel, text, unit: { path: rel, kind: "file", name: rel, lines: `1-${lineCount}` } });
  }
  return out;
}
function createCodeResolverAt(root, ref, notes, wherePaths = [], maxFiles = MAX_FILES) {
  return (_layer, spec, parent) => {
    if (parent === null) return readFilesAt(root, ref, spec, notes, wherePaths, maxFiles);
    if (parent.unit.kind === "file") return readFunctions(parent);
    return readCalls(parent);
  };
}
function readUnit(root, unit) {
  const full = path21.resolve(root, unit.path);
  const rel = path21.relative(root, full);
  const outside = { ok: false, error: `"${unit.path}" is outside the project` };
  if (isOutside(rel)) return outside;
  let text;
  try {
    if (isOutside(path21.relative(realpathSync6(root), realpathSync6(full)))) return outside;
    text = readFileSync21(full, "utf8");
  } catch {
    return { ok: false, error: `cannot read "${unit.path}"` };
  }
  if (unit.kind === "file") return { ok: true, text };
  const range = lineRange2(unit.lines);
  if (!range) return { ok: false, error: `"${unit.path}:${unit.lines}" has a bad line range` };
  const lines = text.split("\n");
  if (range.end > lines.length) return { ok: false, error: `"${unit.path}:${unit.lines}" is past the end of the file now` };
  return { ok: true, text: lines.slice(range.start - 1, range.end).join("\n") };
}

// src/ledger/reuse.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import path22 from "node:path";
function commitsSince(root, sha2, wherePaths) {
  if (!sha2) return null;
  try {
    const first = wherePaths[0];
    const dir = first ? path22.dirname(path22.resolve(root, first.split(":")[0])) : root;
    const top = spawnSync2("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" });
    const gitRoot = top.status === 0 ? top.stdout.trim() : "";
    if (!gitRoot) return null;
    const count = spawnSync2("git", ["rev-list", "--count", `${sha2}..HEAD`], { cwd: gitRoot, encoding: "utf8" });
    if (count.status !== 0) return null;
    const n = Number(count.stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function reuseAge(paths, r, now = Date.now()) {
  const parsed = Date.parse(r.ts);
  const ageDays = Number.isFinite(parsed) ? Math.max(0, Math.floor((now - parsed) / 864e5)) : 0;
  return { ageDays, commitsSince: commitsSince(paths.root, r.commit, r.where) };
}
var MAX_REUSED_AGE_NOTES = 5;
function reusedAgeNotes(paths, ids) {
  if (!ids.length) return [];
  const shown2 = ids.slice(0, MAX_REUSED_AGE_NOTES);
  const parts = shown2.map((id) => {
    const run = findRun(paths, id);
    if (!run || !isContractRun(run)) return `${id} (age unknown)`;
    const age = reuseAge(paths, { ts: run.ts, commit: run.commit ?? null, where: run.where });
    const commits = age.commitsSince !== null ? `, ${age.commitsSince} commit${age.commitsSince === 1 ? "" : "s"}` : "";
    return `${id} (${age.ageDays}d${commits})`;
  });
  const more = ids.length > shown2.length ? `, +${ids.length - shown2.length} more` : "";
  return [`reused: ${parts.join(", ")}${more}`];
}
function isStale2(paths, r, limits, now) {
  if (!limits || limits.maxAgeDays === void 0 && limits.maxCommits === void 0) return false;
  const { ageDays, commitsSince: since } = reuseAge(paths, r, now);
  if (limits.maxAgeDays !== void 0 && ageDays > limits.maxAgeDays) return true;
  if (limits.maxCommits !== void 0 && since !== null && since > limits.maxCommits) return true;
  return false;
}
function readCandidate(paths, offset, who) {
  const run = readRecordAt(paths.log, offset);
  return run && isContractRun(run) && run.adapter === who.adapter && run.model === who.model ? run : void 0;
}
function fastReuse(paths, handle, who, key2, limits, now) {
  const hit = handle.reuseKeyHit(who.adapter, who.model, key2);
  if (!hit || hit.blocked) return void 0;
  const origin = readCandidate(paths, hit.offset, who);
  if (!origin) return void 0;
  const originQid = Object.entries(origin.keys).find(([, k]) => k === key2)?.[0];
  if (originQid === void 0) return void 0;
  const answer = origin.answers[originQid];
  if (!answer) return void 0;
  const reusable = { id: origin.id, answer, ts: origin.ts, commit: origin.commit ?? null, where: origin.where };
  return isStale2(paths, reusable, limits, now) ? void 0 : reusable;
}
function readOrigin(paths, handle, origin, who) {
  const offset = handle.findOffset(origin);
  return offset === void 0 ? void 0 : readCandidate(paths, offset, who);
}
function lookupAnswers(paths, who, keys, opts = {}) {
  const want = new Set(keys);
  if (!want.size) return /* @__PURE__ */ new Map();
  const now = opts.now ?? Date.now();
  return onStore(
    paths.log,
    "read",
    () => withIndex(
      paths,
      (handle) => {
        const out = /* @__PURE__ */ new Map();
        const remaining = /* @__PURE__ */ new Set();
        for (const key2 of want) {
          const hit = fastReuse(paths, handle, who, key2, opts.reuse, now);
          if (hit) {
            out.set(key2, hit);
            continue;
          }
          if (handle.everHeld(who.adapter, who.model, key2)) remaining.add(key2);
        }
        if (remaining.size) {
          for (const { offset } of handle.candidates(who.adapter, who.model)) {
            if (!remaining.size) break;
            const run = readCandidate(paths, offset, who);
            if (!run) continue;
            for (const [qid, key2] of Object.entries(run.keys)) {
              if (!remaining.has(key2)) continue;
              const answer = run.answers[qid];
              const origin = run.reusedFrom[qid] ?? run.id;
              if (!answer || handle.isBlocked(origin)) continue;
              const originRec = origin === run.id ? run : readOrigin(paths, handle, origin, who) ?? run;
              const reusable = { id: origin, answer, ts: originRec.ts, commit: originRec.commit ?? null, where: originRec.where };
              if (isStale2(paths, reusable, opts.reuse, now)) continue;
              out.set(key2, reusable);
              remaining.delete(key2);
            }
          }
        }
        return out;
      },
      { readOnly: opts.readOnly ?? false }
    )
  );
}
function exactReuse(paths, who, keys, opts = {}) {
  if (!keys.length) return void 0;
  const now = opts.now ?? Date.now();
  return onStore(
    paths.log,
    "read",
    () => withIndex(
      paths,
      (handle) => {
        if (keys.some((k) => !handle.everHeld(who.adapter, who.model, k))) return void 0;
        for (const { offset } of handle.candidates(who.adapter, who.model)) {
          const run = readCandidate(paths, offset, who);
          if (!run) continue;
          if (isStale2(paths, { ts: run.ts, commit: run.commit ?? null, where: run.where }, opts.reuse, now)) continue;
          const qidOf = new Map(Object.entries(run.keys).map(([qid, key2]) => [key2, qid]));
          const holds = keys.every((k) => {
            const qid = qidOf.get(k);
            if (qid === void 0) return false;
            const origin = run.reusedFrom[qid] ?? run.id;
            return !handle.isBlocked(origin);
          });
          if (holds) return run.id;
        }
        return void 0;
      },
      { readOnly: true }
    )
  );
}
function cacheEntryFor(paths, from, questions) {
  const origin = findRun(paths, from);
  const providerCalls = origin && isContractRun(origin) ? (origin.telemetry ?? []).filter((t) => t.source === "provider") : [];
  const originQuestions = providerCalls.reduce((n, t) => n + t.questions, 0);
  if (originQuestions === 0) return { source: "cache", from, questions, original: {}, estimated: true };
  const fraction = Math.min(1, questions / originQuestions);
  const hasTokens = providerCalls.length > 0 && providerCalls.every((t) => t.inputTokens !== void 0);
  const totalInputTokens = hasTokens ? providerCalls.reduce((n, t) => n + (t.inputTokens ?? 0), 0) : void 0;
  const totalCostUsd = origin && isContractRun(origin) ? origin.costUsd ?? void 0 : void 0;
  const original = {
    ...totalInputTokens !== void 0 ? { inputTokens: Math.round(totalInputTokens * fraction) } : {},
    ...totalCostUsd !== void 0 ? { costUsd: totalCostUsd * fraction } : {}
  };
  return {
    source: "cache",
    from,
    questions,
    original,
    ...totalCostUsd !== void 0 ? { savedUsd: totalCostUsd * fraction } : {},
    estimated: fraction < 1
  };
}
function cacheTelemetry(paths, reusedFrom) {
  const counts = /* @__PURE__ */ new Map();
  for (const from of Object.values(reusedFrom)) counts.set(from, (counts.get(from) ?? 0) + 1);
  return [...counts].map(([from, questions]) => cacheEntryFor(paths, from, questions));
}

// src/ledger/record.ts
function recordCall(paths, costUsd, entry, now = Date.now()) {
  return withLock(paths.lock, () => {
    const before = budgetStateNow(paths, now);
    const spend = Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0;
    const after = { ...before, spentUsd: before.spentUsd + spend, runs: before.runs + 1 };
    const record2 = "run" in entry ? appendRunLocked(paths, entry.run, now) : "contract" in entry ? appendContractRunLocked(paths, entry.contract, now, budgetLine(after)) : appendFailedLocked(paths, entry.failed, now);
    return { budget: after, record: record2 };
  });
}

// src/verbs/pay.ts
var NOT_COUNTED = "(the call was NOT counted against the budget)";
var fail = (exit, text) => ({ ok: false, result: { exit, text } });
var isStoreFailure = (e) => e instanceof LedgerError || e instanceof LockError || e instanceof StoreError;
var isProbability = (p) => typeof p === "number" && p >= 0 && p <= 1;
var usableCost = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : void 0;
function oneLine(e) {
  const text = redact((e instanceof Error ? e.message : String(e)).split("\n")[0].trim());
  return text.length > 200 ? `${text.slice(0, 199)}\u2026` : text;
}
var actorOf = (ctx) => ctx.env.MM3_ACTOR?.trim() || "agent";
function splitReuse(keyed, reused, answers, reusedFrom) {
  const toAsk = [];
  for (const [q, k] of keyed) {
    const hit = reused.get(k);
    if (hit) {
      answers[q.id] = hit.answer;
      reusedFrom[q.id] = hit.id;
    } else {
      toAsk.push([q, k]);
    }
  }
  return toAsk;
}
function notCounted(e) {
  if (e instanceof BudgetError) return fail(3, `${e.message} ${NOT_COUNTED}`);
  if (isStoreFailure(e)) return fail(1, `${e.message} ${NOT_COUNTED}`);
  throw e;
}
function createdNote(state) {
  return `budget file created with defaults ($${state.capUsd.toFixed(2)} \xB7 ${state.capRuns} runs)`;
}
function preflight(ctx, opts = {}) {
  const now = ctx.now ?? Date.now;
  let budget;
  try {
    budget = loadBudget(ctx.paths, now());
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  if (opts.needsBudget ?? true) {
    const gate = checkBudget2(budget.state);
    if (!gate.ok) return fail(3, gate.message);
  }
  try {
    checkLedger(ctx.paths);
  } catch (e) {
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
  return { ok: true, value: budget };
}
function toAnswer(q, a) {
  const what = q.n === null ? "the goal" : q.item !== void 0 ? `question ${q.n} for ${q.item}` : `question ${q.n}`;
  if (q.kind === "yesno") {
    if (!a || a.type !== "noul") throw new Error(`no yes/no answer for ${what}`);
    if (!isProbability(a.probability)) throw new Error(`${what} probability ${a.probability} is not between 0 and 1`);
    return { kind: "yesno", p: a.probability };
  }
  let dist;
  if (q.kind === "scale") {
    if (!a || a.type !== "score" || !Array.isArray(a.distribution)) throw new Error(`no scale answer for ${what}`);
    dist = Object.fromEntries((q.levels ?? []).map((l, i) => [l, a.distribution[i] ?? 0]));
  } else {
    if (!a || a.type !== "choice" || !a.probabilities || typeof a.probabilities !== "object") throw new Error(`no choice answer for ${what}`);
    dist = Object.fromEntries((q.options ?? []).map((o) => [o, a.probabilities[o] ?? 0]));
  }
  const bad = Object.values(dist).find((v) => !isProbability(v));
  if (bad !== void 0) throw new Error(`${what} has a probability ${bad} that is not between 0 and 1`);
  return { kind: q.kind, dist };
}
function readAnswers(questions, result) {
  const raw = result?.answers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("the provider returned no answers");
  return Object.fromEntries(questions.map((q) => [q.id, toAnswer(q, raw[q.id])]));
}
function logFailed(ctx, verb, costUsd, reason) {
  const now = ctx.now ?? Date.now;
  try {
    recordCall(ctx.paths, costUsd ?? 0, { failed: { verb, actor: actorOf(ctx), adapter: ctx.provider.adapter, model: ctx.provider.model, costUsd: costUsd ?? null, reason } }, now());
  } catch (e) {
    return notCounted(e);
  }
  return fail(1, `\u2716 classifier: ${reason} \u2192 retry; the call was counted against the budget`);
}
function telemetryOf(model, identity, call, result, latencyMs) {
  const r = result ?? {};
  return {
    source: "provider",
    model,
    ...identity.baseURL !== null ? { baseURL: identity.baseURL } : {},
    questions: call.questions.length,
    ...r.usage?.inputTokens !== void 0 ? { inputTokens: r.usage.inputTokens } : {},
    ...r.usage?.outputTokens !== void 0 ? { outputTokens: r.usage.outputTokens } : {},
    latencyMs,
    ...r.retries !== void 0 ? { retries: r.retries } : {},
    status: "ok",
    evidenceBytes: Buffer.byteLength(JSON.stringify(call.state)),
    ...usableCost(r.costUsd) !== void 0 ? { costUsd: usableCost(r.costUsd) } : {},
    ...r.costEstimated ? { costEstimated: true } : {}
  };
}
async function askAll(ctx, verb, calls) {
  const answers = {};
  let costUsd = 0;
  let costEstimated = false;
  let paid = 0;
  const telemetry = [];
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  for (const [i, call] of calls.entries()) {
    let result;
    const startedAt = Date.now();
    try {
      result = await ctx.provider.ask(call.questions.map(toClassifierQuestion), call.state);
    } catch (e) {
      if (paid === 0) return fail(1, `\u2716 classifier: ${oneLine(e)} \u2192 retry later, or set MM3_PROVIDER=fake to check the request`);
      return logFailed(ctx, verb, costUsd, `call ${i + 1} of ${calls.length}: ${oneLine(e)}`);
    }
    const latencyMs = Date.now() - startedAt;
    paid += 1;
    const c = usableCost(result?.costUsd);
    costUsd = costUsd === void 0 || c === void 0 ? void 0 : costUsd + c;
    if (c !== void 0 && result?.costEstimated) costEstimated = true;
    telemetry.push(telemetryOf(ctx.provider.model, identity, call, result, latencyMs));
    try {
      Object.assign(answers, readAnswers(call.questions, result));
    } catch (e) {
      return logFailed(ctx, verb, costUsd, e.message);
    }
  }
  return { ok: true, value: { answers, costUsd, costEstimated, telemetry } };
}
function record(ctx, costUsd, run) {
  const now = ctx.now ?? Date.now;
  try {
    const { record: saved, budget } = recordCall(ctx.paths, costUsd ?? 0, { contract: run }, now());
    return { ok: true, value: { run: saved, budget } };
  } catch (e) {
    return notCounted(e);
  }
}
function recordFree(ctx, run) {
  const now = ctx.now ?? Date.now;
  try {
    const budget = loadBudget(ctx.paths, now()).state;
    return { ok: true, value: { run: appendContractRun(ctx.paths, run, now(), budgetLine(budget)) } };
  } catch (e) {
    if (e instanceof BudgetError) return fail(3, e.message);
    if (isStoreFailure(e)) return fail(1, e.message);
    throw e;
  }
}

// src/classifier/port.ts
var REHEARSAL_ADAPTERS = ["fake", "chaos"];
var isRehearsal = (adapter) => REHEARSAL_ADAPTERS.includes(adapter);

// src/lens/consensus.ts
var THRESHOLDS = DEFAULT_CONFIG.lens;
var majority = (flags) => flags.filter(Boolean).length * 2 >= flags.length;
function computeConsensus(slots, thresholds = THRESHOLDS) {
  if (!slots.length) throw new RangeError("consensus needs at least one slot");
  const concern = slots.map((s) => s.reverse ? 1 - s.p : s.p);
  const flags = concern.map((c) => c >= thresholds.concernAt);
  const frac = flags.filter(Boolean).length / slots.length;
  const agreement = Math.max(frac, 1 - frac);
  const decisiveness = concern.reduce((sum, c) => sum + Math.abs(2 * c - 1), 0) / slots.length;
  const forward = flags.filter((_, i) => !slots[i].reverse);
  const reverse = flags.filter((_, i) => slots[i].reverse);
  const reverseConsistent = !forward.length || !reverse.length || majority(forward) === majority(reverse);
  const consensus = decisiveness < thresholds.weakBelow ? "WEAK" : agreement >= thresholds.strongAt && reverseConsistent ? "STRONG" : "SPLIT";
  return {
    consensus,
    verdict: frac >= 0.5 ? "concern" : "clear",
    agreement,
    decisiveness,
    concernSlots: slots.filter((_, i) => flags[i]).map((s) => s.pos),
    clearSlots: slots.filter((_, i) => !flags[i]).map((s) => s.pos),
    reversed: slots.filter((s) => s.reverse).map((s) => s.pos),
    reverseConsistent
  };
}

// src/verbs/respond.ts
function shownValue(s) {
  return typeof s === "number" ? s : m(["top", s.top], ["p", s.p]);
}
function categoryEntry(g) {
  return [g.name, m(["gate", g.gate], ...[...g.values].map(([n, v]) => [String(n), shownValue(v)]))];
}
function subjectMak(id, gate, subject, extra) {
  return m(
    ["id", id],
    ["gate", gate],
    ...subject.goal ? [["goal", m(["gate", subject.goal.gate], ["p", subject.goal.p])]] : [],
    ...subject.categories.map(categoryEntry),
    ...extra ?? []
  );
}
function reusedIds(reusedFrom) {
  return [...new Set(Object.values(reusedFrom))].sort();
}
function consensusAndEscalate(categories, answers, depth, notes, lens) {
  const slots = categories.filter((c) => c.questions[0]?.kind === "yesno").flatMap((c) => c.questions.map((q) => ({ pos: q.n, reverse: c.pass === "yes", p: answers[String(q.n)].p })));
  const consensus = computeConsensus(slots, lens).consensus;
  const escalate = consensus !== "STRONG" || depth === "thorough" || notes.some((n) => n.startsWith(IRREVERSIBLE_NOTE));
  return { consensus, escalate };
}
function mdlRecorded(mdl2, extra) {
  const fields = [
    ...mdl2?.why ? ["why"] : [],
    ...mdl2?.area && (!Array.isArray(mdl2.area) || mdl2.area.length) ? ["area"] : [],
    ...mdl2?.stage ? ["stage"] : [],
    ...mdl2?.change ? ["change"] : [],
    ...mdl2?.risk ? ["risk"] : [],
    ...mdl2?.problem ? ["problem"] : [],
    ...mdl2?.uses?.length ? ["uses"] : [],
    ...mdl2?.touches?.length ? ["touches"] : [],
    ...mdl2?.blast ? ["blast"] : [],
    ...mdl2?.extras ? Object.keys(mdl2.extras).sort() : [],
    ...extra ?? []
  ];
  return fields.length ? fields : "none";
}
function respondText(mak, mdl2, next, notes) {
  return emit(m(["mak", mak], ["mdl", m(["recorded", mdl2])], ["next", next], ["notes", [...notes]]));
}
function commonNotes(notes, budgetNote, adapter, paths, requestNotes = []) {
  const agents = paths ? agentsNote(paths) : void 0;
  return [...notes, ...adapter && isRehearsal(adapter) ? [`adapter ${adapter} \xB7 not evidence`] : [], ...agents ? [agents] : [], ...requestNotes, budgetNote];
}
var GOAL_ONLY_NEXT = "the goal missed though every part passed \xB7 fix what is missing, then run it again";
var ALL_SKIPPED_NEXT = "every item was skipped \xB7 raise depth or narrow over, then run it again";
function outcomeNext(id, gate, graded, categories, onPass) {
  if (gate === "pass") return onPass;
  const gateOf2 = new Map(graded.map((g) => [g.name, g.gate]));
  const target = categories.find((c) => gateOf2.get(c.name) === gate)?.name;
  if (target) return drillNext(id, target);
  return categories.every((c) => gateOf2.get(c.name) === "pass") ? GOAL_ONLY_NEXT : drillNext(id, categories[0].name);
}
function drillNext(id, target) {
  return `mm3 template drill --parent ${id} --from ${target}`;
}
function regressionNext(id, regressed, categories) {
  const first = regressed[0];
  const target = categories.find((c) => c.questions.some((q) => q.n === first))?.name ?? categories[0].name;
  return drillNext(id, target);
}
function sweepNext(id, gate, worst, graded, onPass) {
  if (gate === "pass") return onPass;
  if (worst.length) return drillNext(id, worst[0].id);
  return graded.length ? GOAL_ONLY_NEXT : ALL_SKIPPED_NEXT;
}
function dryRunText(plan, extraNotes = []) {
  return emit(
    m(
      [
        "plan",
        m(
          ["calls", plan.calls],
          ["questions", plan.questions],
          ...plan.items !== void 0 ? [["items", plan.items]] : [],
          ...plan.reused !== void 0 ? [["reused", plan.reused]] : [],
          ["route", plan.route],
          ...plan.baseURL ? [["baseURL", plan.baseURL]] : []
        )
      ],
      ["notes", ["dry run: no call, no spend", ...extraNotes]]
    )
  );
}
var MAX_PROBE_WARNINGS = 3;
var PATH_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "rb",
  "php",
  "cs",
  "json",
  "yaml",
  "yml",
  "html",
  "sql",
  "md",
  "sh",
  "env"
]);
function looksLikeFilePath(text) {
  if (text.includes("/")) return true;
  const dot = text.lastIndexOf(".");
  if (dot <= 0 || dot === text.length - 1) return false;
  return PATH_EXTENSIONS.has(text.slice(dot + 1).toLowerCase());
}
function allQuestions(mak) {
  return [...mak.categories, ...mak.layers.flatMap((l) => l.categories)].flatMap((c) => c.questions);
}
function probeWarnings(mak) {
  const warnings = [];
  for (const q of allQuestions(mak)) {
    const marks = q.text.match(/\?/g)?.length ?? 0;
    if (marks >= 2 || / and /.test(q.text)) {
      warnings.push(`probe: "${clip(q.text, 60)}" reads as two questions joined into one \u2014 split it`);
    }
    if (mak.where.length > 0) {
      for (const m2 of q.text.matchAll(/`([^`]+)`/g)) {
        const named = m2[1];
        if (looksLikeFilePath(named) && !mak.where.includes(named) && !mak.where.some((w) => w.startsWith(`${named}:`))) {
          warnings.push(`probe: "${clip(named, 60)}" is named in a question but not in where: \u2014 it has nothing to answer from`);
        }
      }
    }
  }
  return warnings.length > MAX_PROBE_WARNINGS ? [...warnings.slice(0, MAX_PROBE_WARNINGS), `probe: ${warnings.length - MAX_PROBE_WARNINGS} more question warning(s) not shown`] : warnings;
}
var COST_ESTIMATED_NOTE = "cost estimated from tokens (no live pricing reported)";
function sweepEntry(g) {
  const catEntries = [];
  const qEntries = [];
  for (const c of g.own) if (c.gate !== "pass") catEntries.push([c.name, c.gate]);
  for (const c of g.own) for (const [n, mark] of c.marks) if (mark !== "pass") qEntries.push([n, shownValue(c.values.get(n))]);
  qEntries.sort((a, b) => a[0] - b[0]);
  return [g.id, m(...catEntries, ...qEntries.map(([n, v]) => [String(n), v]))];
}

// src/verbs/sweep.ts
function groupByLayer(items) {
  const out = /* @__PURE__ */ new Map();
  for (const it of items) {
    const arr = out.get(it.layer);
    if (arr) arr.push(it);
    else out.set(it.layer, [it]);
  }
  return out;
}
function chunk(arr, size) {
  if (size <= 0 || arr.length <= size) return [[...arr]];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function planSweep(request, who, paths, dryRun, opts = {}, limits = {}) {
  const { layers, items } = expand(request.mak.over, opts);
  const itemsByLayer = groupByLayer(items);
  const reuseLimits = limits.reuse;
  const projectMaxItems = limits.sweep?.maxItems;
  const maxQuestionsPerCall = limits.sweep?.maxQuestionsPerCall ?? DEFAULT_CONFIG.sweep.maxQuestionsPerCall;
  const asksByItem = /* @__PURE__ */ new Map();
  const allKeys = [];
  for (const layer of request.mak.layers) {
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const asks = itemQuestions(item, layer.categories).map((q) => ({ q, key: answerKey(item.text, q) }));
      asksByItem.set(item.id, asks);
      for (const a of asks) allKeys.push(a.key);
    }
  }
  const goalQ = goalQuestion(request.mak.goal);
  const reused = lookupAnswers(paths, who, allKeys, { readOnly: dryRun, reuse: reuseLimits });
  const depthCap = (limits.sweep?.itemsPerLayer ?? SWEEP_ITEM_CAP)[request.mak.depth ?? "quick"];
  const cap = projectMaxItems !== void 0 ? Math.min(depthCap, projectMaxItems) : depthCap;
  const keys = /* @__PURE__ */ new Map();
  const reusedFrom = /* @__PURE__ */ new Map();
  const answers = {};
  let askedQuestions = 0;
  const work = request.mak.layers.map((layer) => {
    let askedCount = 0;
    const callItems = [];
    const callQuestions = [];
    const itemIds = [];
    const skipped = [];
    const resolvedItems2 = [];
    for (const item of itemsByLayer.get(layer.name) ?? []) {
      const itemAsks = asksByItem.get(item.id) ?? [];
      if (!itemAsks.length) continue;
      const missing = itemAsks.filter((a) => !reused.has(a.key));
      if (missing.length === 0) {
        resolvedItems2.push(item);
        for (const a of itemAsks) {
          const hit = reused.get(a.key);
          reusedFrom.set(a.q.id, hit.id);
          keys.set(a.q.id, a.key);
          answers[a.q.id] = hit.answer;
        }
      } else if (askedCount >= cap) {
        skipped.push(item.id);
      } else {
        askedCount += 1;
        callItems.push(item);
        itemIds.push(item.id);
        resolvedItems2.push(item);
        for (const a of itemAsks) {
          keys.set(a.q.id, a.key);
          const hit = reused.get(a.key);
          if (hit) {
            reusedFrom.set(a.q.id, hit.id);
            answers[a.q.id] = hit.answer;
          } else {
            callQuestions.push(a.q);
            askedQuestions += 1;
          }
        }
      }
    }
    return { layer: layer.name, callItems, callQuestions, itemIds, skipped, resolvedItems: resolvedItems2 };
  });
  const resolvedItems = work.flatMap((w) => w.resolvedItems).sort((a, b) => a.id.localeCompare(b.id));
  const resolvedText = resolvedItems.map((it) => it.text).join("\n");
  const goalKey = answerKey(resolvedText, goalQ);
  const goalReused = lookupAnswers(paths, who, [goalKey], { readOnly: dryRun, reuse: reuseLimits });
  const goalHit = goalReused.get(goalKey);
  if (goalHit) {
    reusedFrom.set(goalQ.id, goalHit.id);
    keys.set(goalQ.id, goalKey);
    answers[goalQ.id] = goalHit.answer;
  } else {
    const first = work[0];
    if (first) {
      first.callQuestions = [goalQ, ...first.callQuestions];
      keys.set(goalQ.id, goalKey);
    }
  }
  const splitNotes = [];
  const planned = work.map(({ layer, callItems, callQuestions, itemIds, skipped }) => {
    if (!callQuestions.length) return { layer, call: null, extraCalls: [], itemIds, skipped };
    const hasGoal = callQuestions[0] === goalQ;
    const chunks = chunk(callQuestions, maxQuestionsPerCall);
    if (chunks.length > 1) {
      splitNotes.push(`${layer}: ${callQuestions.length} questions split into ${chunks.length} calls (over sweep.maxQuestionsPerCall: ${maxQuestionsPerCall})`);
    }
    const calls = chunks.map((qs, i) => {
      const notes = [];
      const wanted = new Set(qs.map((q) => q.item).filter((id) => id !== void 0));
      const chunkItems = wanted.size ? callItems.filter((it) => wanted.has(it.id)) : callItems;
      const state = { ...i === 0 && hasGoal ? { goal: redact(request.mak.goal) } : {}, items: itemsState(chunkItems, notes, limits.evidence) };
      return { state, questions: qs };
    });
    return { layer, call: calls[0], extraCalls: calls.slice(1), itemIds, skipped };
  });
  return { layers, items, planned, keys, reusedFrom, answers, askedQuestions, splitNotes };
}
function planNeedsBudget(plan) {
  return plan.planned.some((p) => p.call !== null);
}
function plannedCalls(plan) {
  return plan.planned.flatMap((p) => p.call ? [p.call, ...p.extraCalls] : []);
}
function plannedCallCount(plan) {
  return plannedCalls(plan).length;
}
async function runSweep(ctx, verb, plan) {
  const skippedIds = new Set(plan.planned.flatMap((p) => p.skipped));
  const askedIds = new Set(plan.planned.flatMap((p) => p.itemIds));
  const reusedItemIds = /* @__PURE__ */ new Set();
  for (const qid of plan.reusedFrom.keys()) {
    const at = qid.lastIndexOf("#");
    if (at > 0) reusedItemIds.add(qid.slice(0, at));
  }
  const statusOf = (id) => {
    if (skippedIds.has(id)) return "skipped";
    if (askedIds.has(id)) return "asked";
    if (reusedItemIds.has(id)) return "reused";
    return "none";
  };
  const calls = plannedCalls(plan);
  if (calls.length === 0) return { ok: true, value: { answers: plan.answers, costUsd: 0, costEstimated: false, telemetry: [], statusOf } };
  const asked2 = await askAll(ctx, verb, calls);
  if (!asked2.ok) return asked2;
  return {
    ok: true,
    value: { answers: { ...plan.answers, ...asked2.value.answers }, costUsd: asked2.value.costUsd, costEstimated: asked2.value.costEstimated, telemetry: asked2.value.telemetry, statusOf }
  };
}
function sweepDryRun(plan, identity, extraNotes = []) {
  const calls = plannedCallCount(plan);
  const askedItems = plan.planned.reduce((n, p) => n + p.itemIds.length, 0);
  const skippedItems = plan.planned.reduce((n, p) => n + p.skipped.length, 0);
  return {
    exit: 0,
    text: dryRunText(
      {
        calls,
        questions: plan.askedQuestions,
        items: plan.items.length,
        reused: plan.items.length - askedItems - skippedItems,
        route: identity.route,
        baseURL: identity.baseURL
      },
      [...extraNotes, ...plan.splitNotes]
    )
  };
}
function recordSweep(ctx, calls, costUsd, run) {
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
function itemRecords(items, grades) {
  const out = {};
  for (const it of items) {
    const g = grades.get(it.id);
    out[it.id] = {
      layer: it.layer,
      fill: it.fill,
      ...it.unit ? { unit: it.unit } : {},
      status: g.status,
      gate: g.gate,
      categories: Object.fromEntries(g.own.map((c) => [c.name, c.gate]))
    };
  }
  return out;
}

// src/verbs/replay.ts
function planCall(keyed, reused, state, answers, reusedFrom) {
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom).map(([q]) => q);
  return toAsk.length ? { state, questions: toAsk } : null;
}
function gradeReplay(categories, answers) {
  const beforeGrade = gradeSubject(categories, answers, "before:");
  const afterCatsGrade = gradeSubject(categories, answers, "after:");
  const g = answers["goal"];
  const goal = { gate: goalGate(g.p), p: g.p };
  const beforeMarks = /* @__PURE__ */ new Map();
  for (const c of beforeGrade.categories) for (const [n, mk] of c.marks) beforeMarks.set(n, mk);
  const afterMarks = /* @__PURE__ */ new Map();
  for (const c of afterCatsGrade.categories) for (const [n, mk] of c.marks) afterMarks.set(n, mk);
  const categoryGrades = categories.map((c, i) => {
    const beforeCat = beforeGrade.categories[i];
    const afterCat = afterCatsGrade.categories[i];
    const fixed = [...beforeCat.marks].filter(([n, mk]) => mk !== "pass" && afterCat.marks.get(n) === "pass").map(([n]) => n);
    const still = [...beforeCat.marks].filter(([n, mk]) => mk !== "pass" && afterCat.marks.get(n) !== "pass").map(([n]) => n);
    return { name: c.name, before: beforeCat.gate, after: afterCat.gate, fixed, still };
  });
  const regressed = categories.flatMap((c) => c.questions).map((q) => q.n).filter((n) => beforeMarks.get(n) === "pass" && afterMarks.get(n) !== "pass").sort((a, b) => a - b);
  const gate = regressed.length > 0 ? "fail" : combine([goal.gate, ...afterCatsGrade.categories.map((c) => c.gate)]);
  return { categories: categoryGrades, goal, regressed, gate };
}
async function runReplay(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "replay", mdlFields, contractLimits(cfg, "replay"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const parent = findRun(ctx.paths, request.mak.parent);
  if (!parent) return { exit: 2, text: stopText([`\u2716 mak.parent: ${request.mak.parent} is not in the ledger \u2192 check the id`], "replay") };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`\u2716 mak.parent: ${parent.id} predates the YAML contract \u2192 run class again on this code`], "replay") };
  if (parent.items !== null) return runSweepReplay(ctx, request, loaded, parent, cfg);
  const categories = parent.ask.categories;
  const concernNames = categories.filter((c) => c.section === "concerns").map((c) => c.name);
  const expect = request.mak.expect;
  const expectList = expect === "none" ? [] : expect;
  const badExpect = expectList.find((name) => !concernNames.includes(name));
  if (badExpect !== void 0) {
    return { exit: 2, text: stopText([`\u2716 mak.expect: "${badExpect}" is not a concern of ${parent.id} \u2192 use one of ${concernNames.join(", ")}`], "replay") };
  }
  const paths = [...new Set(parent.where.map((w) => w.split(":")[0]))];
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const compare = request.mak.compare;
  const before = readGitEvidence(ctx.paths.root, compare.before, "before", paths, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  const after = readGitEvidence(ctx.paths.root, compare.after, "after", paths, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!before.ok || !after.ok) {
    const errors = [...before.ok ? [] : before.errors, ...after.ok ? [] : after.errors];
    return { exit: 2, text: stopText(errors, "replay") };
  }
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const beforeEvidenceStr = subjectEvidence(before.files);
  const afterEvidenceStr = subjectEvidence(after.files);
  const beforeQuestions = subjectQuestions(categories, "before:");
  const afterQuestions = [goalQuestion(request.mak.goal), ...subjectQuestions(categories, "after:")];
  const beforeKeyed = beforeQuestions.map((q) => [q, answerKey(beforeEvidenceStr, q)]);
  const afterKeyed = afterQuestions.map((q) => [q, answerKey(afterEvidenceStr, q)]);
  const beforeReused = lookupAnswers(ctx.paths, who, beforeKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });
  const afterReused = lookupAnswers(ctx.paths, who, afterKeyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });
  const answers = {};
  const reusedFrom = {};
  const beforeCall = planCall(beforeKeyed, beforeReused, { code: before.files }, answers, reusedFrom);
  const afterCall = planCall(afterKeyed, afterReused, { goal: redact(request.mak.goal), code: after.files }, answers, reusedFrom);
  const calls = [...beforeCall ? [beforeCall] : [], ...afterCall ? [afterCall] : []];
  if (ctx.dryRun) {
    const total = beforeKeyed.length + afterKeyed.length;
    const askedQuestions = calls.reduce((n, c) => n + c.questions.length, 0);
    return { exit: 0, text: dryRunText({ calls: calls.length, questions: askedQuestions, reused: total - askedQuestions, route: identity.route, baseURL: identity.baseURL }) };
  }
  const pre = preflight(ctx, { needsBudget: calls.length > 0 });
  if (!pre.ok) return pre.result;
  let costUsd = 0;
  let costEstimated = false;
  let telemetry = [];
  if (calls.length > 0) {
    const asked2 = await askAll(ctx, "replay", calls);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
    telemetry = asked2.value.telemetry;
  }
  const keys = {};
  for (const [q, k] of [...beforeKeyed, ...afterKeyed]) keys[q.id] = k;
  const replayGrade = gradeReplay(categories, answers);
  const { goal, regressed, gate } = replayGrade;
  const afterCatsGrade = gradeSubject(categories, answers, "after:");
  const catEntries = replayGrade.categories.map((c) => {
    const probeCount = c.fixed.length + c.still.length;
    return [
      c.name,
      m(
        ["before", c.before],
        ["after", c.after],
        ...c.fixed.length ? [["fixed", c.fixed]] : [],
        ...c.still.length ? [["still", c.still]] : [],
        ...probeCount > 0 ? [["probes", `${c.fixed.length}/${probeCount} fixed`]] : []
      )
    ];
  });
  const gradeByName = new Map(replayGrade.categories.map((c) => [c.name, c]));
  const expectedFixed = [];
  const expectedStill = [];
  for (const name of expectList) {
    const g = gradeByName.get(name);
    if (!g || g.before === "pass") continue;
    (g.after === "pass" ? expectedFixed : expectedStill).push(name);
  }
  const expectSet = new Set(expectList);
  const unexpected = concernNames.filter((name) => {
    const g = gradeByName.get(name);
    return g !== void 0 && g.before !== g.after && !expectSet.has(name);
  });
  let sawWholeFileNote = false;
  const evidenceNotes = [...before.notes, ...after.notes].filter((n) => {
    if (n !== WHOLE_FILE_NOTE) return true;
    if (sawWholeFileNote) return false;
    sawWholeFileNote = true;
    return true;
  });
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id, budget) => respondText(
    m(
      ["id", id],
      ["gate", gate],
      ["goal", m(["gate", goal.gate], ["p", goal.p])],
      ...catEntries,
      ["expected", m(["fixed", expectedFixed], ["still", expectedStill])],
      ...unexpected.length ? [["unexpected", unexpected]] : [],
      ["regressed", regressed],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ),
    mdlRecorded(request.mdl, ["parent"]),
    // A regression alone can fail the gate even when every "after" category passes on its own (C-064) —
    // outcomeNext's gate-matching search would then find nothing and wrongly blame the goal (GOAL_ONLY_NEXT).
    // regressed takes priority: name it, per C-065 (revert or drill into it). [C-091]
    regressed.length ? regressionNext(id, regressed, categories) : outcomeNext(id, gate, afterCatsGrade.categories, categories, `mm3 outcome ${request.mak.parent} held --by <you>`),
    commonNotes(
      [...loaded.notes, ...evidenceNotes, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `2 states \xB7 ${budget}`,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const beforeSha = resolveRefSha(ctx.paths.root, compare.before, parent.where);
  const afterSha = resolveRefSha(ctx.paths.root, compare.after, parent.where);
  const run = {
    verb: "replay",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: null,
    where: parent.where,
    parent: request.mak.parent,
    from: null,
    compare,
    expect,
    mdl: request.mdl,
    ask: { categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(afterCatsGrade.categories.map((c) => [c.name, c.gate])),
    gate,
    goalGate: goal.gate,
    goalP: goal.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls: calls.length,
    route: identity.route,
    baseURL: identity.baseURL,
    commit: afterSha,
    commits: { before: beforeSha, after: afterSha },
    telemetry
  };
  const rec = calls.length === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
function itemMarks(ig) {
  if (!ig || ig.status !== "asked" && ig.status !== "reused") return void 0;
  const marks = /* @__PURE__ */ new Map();
  for (const c of ig.own) for (const [n, mk] of c.marks) marks.set(n, mk);
  return marks;
}
function sweepReplayItemGrade(beforeIg, afterIg) {
  const beforeMarks = itemMarks(beforeIg);
  const afterMarks = itemMarks(afterIg);
  if (!beforeMarks && !afterMarks) return void 0;
  const nums = /* @__PURE__ */ new Set([...beforeMarks?.keys() ?? [], ...afterMarks?.keys() ?? []]);
  const fixed = [];
  const still = [];
  const regressed = [];
  for (const n of [...nums].sort((a, b) => a - b)) {
    const b = beforeMarks?.get(n);
    const a = afterMarks?.get(n);
    if (b !== void 0 && b !== "pass" && a === "pass") fixed.push(n);
    else if (b !== void 0 && b !== "pass" && a !== void 0 && a !== "pass") still.push(n);
    if (b === "pass" && a !== void 0 && a !== "pass") regressed.push(n);
  }
  return { before: beforeMarks ? beforeIg.ownGate : "unsure", after: afterMarks ? afterIg.ownGate : "unsure", fixed, still, regressed };
}
function gradeSweepReplay(itemIds, beforeGrades, afterGrades) {
  const out = /* @__PURE__ */ new Map();
  for (const id of itemIds) {
    const g = sweepReplayItemGrade(beforeGrades.get(id), afterGrades.get(id));
    if (g) out.set(id, g);
  }
  return out;
}
var WHERE_CAP = 50;
function whereFromItems(items) {
  return [...new Set(items.flatMap((i) => i.unit ? [i.unit.path] : []))].sort().slice(0, WHERE_CAP);
}
function sweepResolverAt(root, ref, notes, wherePaths, maxFiles) {
  return ref === "worktree" ? createCodeResolver(root, notes, maxFiles) : createCodeResolverAt(root, ref, notes, wherePaths, maxFiles);
}
async function runSweepReplay(ctx, request, loaded, parent, cfg) {
  const layers = parent.ask.layers;
  const over = parent.over ?? {};
  const chain0 = Object.keys(over)[0];
  if (chain0 !== void 0 && over[chain0] === "each") {
    return {
      exit: 2,
      text: stopText([`\u2716 mak.parent: ${parent.id} is a drill continuation (over: starts with "each") \u2192 replay can't rebuild its root item; run the sweep again instead`], "replay")
    };
  }
  const concernNames = [...new Set(layers.flatMap((l) => l.categories.filter((c) => c.section === "concerns").map((c) => c.name)))];
  const expect = request.mak.expect;
  const expectList = expect === "none" ? [] : expect;
  const badExpect = expectList.find((name) => !concernNames.includes(name));
  if (badExpect !== void 0) {
    return { exit: 2, text: stopText([`\u2716 mak.expect: "${badExpect}" is not a concern of ${parent.id} \u2192 use one of ${concernNames.join(", ")}`], "replay") };
  }
  const itemPaths = [...new Set(Object.values(parent.items ?? {}).flatMap((it) => it.unit ? [it.unit.path] : []))];
  const compare = request.mak.compare;
  const needsCode = firstStringLayer(over) !== null;
  if (needsCode) {
    const checkRef = (ref, field) => {
      if (ref === "worktree") return void 0;
      if (isGitOption(ref)) return `\u2716 mak.compare.${field}: "${ref}" looks like an option, not a ref \u2192 use a branch, tag or commit`;
      return resolveRefSha(ctx.paths.root, ref, itemPaths) === null ? `\u2716 mak.compare.${field}: "${ref}" not found by git (or the project isn't a repo there) \u2192 check the ref` : void 0;
    };
    const errors = [checkRef(compare.before, "before"), checkRef(compare.after, "after")].filter((e) => e !== void 0);
    if (errors.length) return { exit: 2, text: stopText(errors, "replay") };
  }
  const sweepRequest = { mak: { goal: request.mak.goal, where: [], categories: [], layers, over }, mdl: request.mdl };
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const beforeNotes = [];
  const afterNotes = [];
  const limits = { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence };
  const beforeOpts = needsCode ? { resolve: sweepResolverAt(ctx.paths.root, compare.before, beforeNotes, itemPaths, cfg.evidence.maxFiles) } : {};
  const afterOpts = needsCode ? { resolve: sweepResolverAt(ctx.paths.root, compare.after, afterNotes, itemPaths, cfg.evidence.maxFiles) } : {};
  const beforePlan = planSweep(sweepRequest, who, ctx.paths, ctx.dryRun ?? false, beforeOpts, limits);
  const afterPlan = planSweep(sweepRequest, who, ctx.paths, ctx.dryRun ?? false, afterOpts, limits);
  if (ctx.dryRun) {
    const reusedOf = (plan) => plan.items.length - plan.planned.reduce((n, p) => n + p.itemIds.length + p.skipped.length, 0);
    return {
      exit: 0,
      text: dryRunText(
        {
          calls: plannedCallCount(beforePlan) + plannedCallCount(afterPlan),
          questions: beforePlan.askedQuestions + afterPlan.askedQuestions,
          items: beforePlan.items.length + afterPlan.items.length,
          reused: reusedOf(beforePlan) + reusedOf(afterPlan),
          route: identity.route,
          baseURL: identity.baseURL
        },
        [...beforePlan.splitNotes, ...afterPlan.splitNotes]
      )
    };
  }
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(beforePlan) || planNeedsBudget(afterPlan) });
  if (!pre.ok) return pre.result;
  const beforeSwept = await runSweep(ctx, "replay", beforePlan);
  if (!beforeSwept.ok) return beforeSwept.result;
  const afterSwept = await runSweep(ctx, "replay", afterPlan);
  if (!afterSwept.ok) return afterSwept.result;
  const combineCost = (a, b) => a === void 0 || b === void 0 ? void 0 : a + b;
  const costUsd = combineCost(beforeSwept.value.costUsd, afterSwept.value.costUsd);
  const costEstimated = beforeSwept.value.costEstimated || afterSwept.value.costEstimated;
  const calls = plannedCallCount(beforePlan) + plannedCallCount(afterPlan);
  const askedQuestions = beforePlan.askedQuestions + afterPlan.askedQuestions;
  const categoriesOf = (layer) => layers.find((l) => l.name === layer)?.categories ?? [];
  const beforeGrades = gradeItems(beforePlan.items, categoriesOf, beforeSwept.value.statusOf, beforeSwept.value.answers);
  const afterGrades = gradeItems(afterPlan.items, categoriesOf, afterSwept.value.statusOf, afterSwept.value.answers);
  const itemIds = [];
  const seenIds = /* @__PURE__ */ new Set();
  for (const it of [...afterPlan.items, ...beforePlan.items]) {
    if (seenIds.has(it.id)) continue;
    seenIds.add(it.id);
    itemIds.push(it.id);
  }
  const itemGrades = gradeSweepReplay(itemIds, beforeGrades, afterGrades);
  const regressedFlat = [];
  for (const [id, g] of itemGrades) for (const n of g.regressed) regressedFlat.push(`${id}#${n}`);
  const categoryAt = (grades, id, name) => grades.get(id)?.own.find((c) => c.name === name);
  const expectedFixed = [];
  const expectedStill = [];
  for (const name of expectList) {
    let anyNotPassBefore = false;
    let allFixed = true;
    for (const id of itemIds) {
      const b = categoryAt(beforeGrades, id, name);
      if (!b || b.gate === "pass") continue;
      anyNotPassBefore = true;
      const a = categoryAt(afterGrades, id, name);
      if (!a || a.gate !== "pass") allFixed = false;
    }
    if (anyNotPassBefore) (allFixed ? expectedFixed : expectedStill).push(name);
  }
  const expectSet = new Set(expectList);
  const unexpected = concernNames.filter(
    (name) => !expectSet.has(name) && itemIds.some((id) => {
      const b = categoryAt(beforeGrades, id, name);
      const a = categoryAt(afterGrades, id, name);
      return b && a && b.gate !== a.gate;
    })
  );
  const afterGoalAnswer = afterSwept.value.answers["goal"];
  const afterGoalGate = goalGate(afterGoalAnswer.p);
  const gate = regressedFlat.length > 0 ? "fail" : sweepGate(afterGoalGate, afterGrades);
  const afterGraded = [...afterGrades.values()].filter((g) => g.status === "asked" || g.status === "reused");
  const passing = afterGraded.filter((g) => g.ownGate === "pass").length;
  const itemsValue = [];
  for (const id of itemIds) {
    const g = itemGrades.get(id);
    if (!g || g.before === "pass" && g.after === "pass") continue;
    const probeCount = g.fixed.length + g.still.length;
    itemsValue.push([
      id,
      m(
        ["before", g.before],
        ["after", g.after],
        ...g.fixed.length ? [["fixed", g.fixed]] : [],
        ...g.still.length ? [["still", g.still]] : [],
        ...probeCount > 0 ? [["probes", `${g.fixed.length}/${probeCount} fixed`]] : []
      )
    ]);
  }
  const reusedFromObj = { ...Object.fromEntries(beforePlan.reusedFrom), ...Object.fromEntries(afterPlan.reusedFrom) };
  const reusedRunIds = reusedIds(reusedFromObj);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  const telemetry = [...beforeSwept.value.telemetry, ...afterSwept.value.telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];
  const response = (id, budget) => respondText(
    m(
      ["id", id],
      ["gate", gate],
      ["goal", m(["gate", afterGoalGate], ["p", afterGoalAnswer.p])],
      ["items", m(...itemsValue)],
      ["passing", passing],
      ["expected", m(["fixed", expectedFixed], ["still", expectedStill])],
      ...unexpected.length ? [["unexpected", unexpected]] : [],
      ["regressed", regressedFlat],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ),
    mdlRecorded(request.mdl, ["parent"]),
    regressedFlat.length ? drillNext(id, regressedFlat[0].split("#")[0]) : sweepNext(id, gate, worstFirst(afterGrades.values()), afterGraded, `mm3 outcome ${request.mak.parent} held --by <you>`),
    commonNotes(
      [
        ...loaded.notes,
        ...beforeNotes,
        ...afterNotes,
        ...beforePlan.splitNotes,
        ...afterPlan.splitNotes,
        ...reusedAges,
        ...pre.value.created ? [createdNote(pre.value.state)] : [],
        ...costEstimated ? [COST_ESTIMATED_NOTE] : []
      ],
      `2 refs \xB7 ${calls} call${calls === 1 ? "" : "s"} \xB7 ${askedQuestions} question${askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const prefixed = (prefix, qid) => `${prefix}:${qid}`;
  const answers = {};
  for (const [qid, a] of Object.entries(beforeSwept.value.answers)) answers[prefixed("before", qid)] = a;
  for (const [qid, a] of Object.entries(afterSwept.value.answers)) answers[prefixed("after", qid)] = a;
  const keys = {};
  for (const [qid, k] of beforePlan.keys) keys[prefixed("before", qid)] = k;
  for (const [qid, k] of afterPlan.keys) keys[prefixed("after", qid)] = k;
  const reusedFrom = {};
  for (const [qid, r] of beforePlan.reusedFrom) reusedFrom[prefixed("before", qid)] = r;
  for (const [qid, r] of afterPlan.reusedFrom) reusedFrom[prefixed("after", qid)] = r;
  const where = whereFromItems([...afterPlan.items, ...beforePlan.items]);
  const beforeSha = resolveRefSha(ctx.paths.root, compare.before, itemPaths);
  const afterSha = resolveRefSha(ctx.paths.root, compare.after, itemPaths);
  const run = {
    verb: "replay",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: null,
    where,
    parent: request.mak.parent,
    from: null,
    compare,
    expect,
    mdl: request.mdl,
    ask: { categories: [], layers },
    over,
    items: itemRecords(afterPlan.items, afterGrades),
    answers,
    keys,
    reusedFrom,
    categories: {},
    gate,
    goalGate: afterGoalGate,
    goalP: afterGoalAnswer.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    commit: afterSha,
    commits: { before: beforeSha, after: afterSha },
    telemetry
  };
  return recordSweep(ctx, calls, costUsd, run);
}

// src/ledger/stale.ts
var MAX_STALE_NOTES = 3;
function sameQuestion(older, asking) {
  if (older.kind !== asking.kind || older.text !== asking.text) return false;
  if (older.kind === "scale") return JSON.stringify(older.levels) === JSON.stringify(asking.levels);
  if (older.kind === "choice") return JSON.stringify(older.options) === JSON.stringify(asking.options);
  return true;
}
function staleNotes(paths, where, toAsk) {
  if (!toAsk.length || !where.length) return [];
  const places = [...new Set(where.map(stripLines))];
  return withIndex(
    paths,
    (handle) => {
      const offsets = /* @__PURE__ */ new Set();
      for (const place of places) for (const c of handle.placeCandidates(place)) offsets.add(c.offset);
      const notes = [];
      const seenOrigins = /* @__PURE__ */ new Set();
      for (const offset of offsets) {
        if (notes.length >= MAX_STALE_NOTES) break;
        const rec = readRecordAt(paths.log, offset);
        if (!rec || !isContractRun(rec) || rec.items !== null) continue;
        const olderQuestions = rec.ask.categories.flatMap((c) => c.questions);
        for (const [q, key2] of toAsk) {
          const match = olderQuestions.find((rq) => sameQuestion(rq, q));
          if (!match) continue;
          const oldKey = rec.keys[String(match.n)];
          if (oldKey === void 0 || oldKey === key2) continue;
          const origin = rec.reusedFrom[String(match.n)] ?? rec.id;
          if (seenOrigins.has(origin)) break;
          seenOrigins.add(origin);
          const ans = rec.answers[String(match.n)];
          const p = ans && ans.kind === "yesno" ? ` (p ${ans.p.toFixed(2)})` : "";
          notes.push(`stale: ${rec.id} answered "${clip(q.text, 50)}" on older code${p}`);
          break;
        }
      }
      return notes;
    },
    { readOnly: true }
  );
}

// src/verbs/class.ts
var CAP_NOTE = "would be blocked: the budget cap is already reached";
async function runClass(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "class", mdlFields, contractLimits(cfg, "class"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const evidence = readCodeEvidence(ctx.paths.root, request.mak.where, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "class") };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)]);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: cfg.reuse });
  const answers = {};
  const reusedFrom = {};
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom);
  if (ctx.dryRun) {
    let capNote = [];
    if (toAsk.length > 0) {
      const state = peekBudget(ctx.paths);
      if (state && !checkBudget2(state).ok) capNote = [CAP_NOTE];
    }
    return {
      exit: 0,
      text: dryRunText(
        { calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL },
        [...capNote, ...probeWarnings(request.mak)]
      )
    };
  }
  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;
  const stale = staleNotes(ctx.paths, request.mak.where, toAsk);
  let costUsd;
  let costEstimated = false;
  let calls;
  let telemetry = [];
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call = { state: { goal: redact(request.mak.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked2 = await askAll(ctx, "class", [call]);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
    telemetry = asked2.value.telemetry;
    calls = 1;
  }
  const keys = {};
  for (const [q, k] of keyed) keys[q.id] = k;
  const { consensus, escalate } = consensusAndEscalate(request.mak.categories, answers, request.mak.depth, loaded.notes, cfg.lens);
  const subject = gradeSubject(request.mak.categories, answers);
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id, budget) => respondText(
    subjectMak(id, subject.gate, subject, [
      ["consensus", consensus],
      ["escalate", escalate],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ]),
    mdlRecorded(request.mdl),
    outcomeNext(id, subject.gate, subject.categories, request.mak.categories, `act on it \xB7 then prove it with mm3 replay --parent ${id} --compare <before>..HEAD`),
    commonNotes(
      [...loaded.notes, ...evidence.evidence.notes, ...stale, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      budget,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const run = {
    verb: "class",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where: request.mak.where,
    parent: request.mak.parent ?? request.mdl?.parent ?? null,
    from: null,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, request.mak.where),
    mdl: request.mdl,
    ask: { categories: request.mak.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    telemetry
  };
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}

// src/verbs/drill.ts
var REDRILL_NEXT = "fix it, then run this drill again (unchanged items are reused, so it is nearly free)";
var WHERE_CAP2 = 50;
function whereFromItems2(items) {
  return [...new Set(items.flatMap((i) => i.unit ? [i.unit.path] : []))].sort().slice(0, WHERE_CAP2);
}
async function runOneSubjectProof(ctx, loaded, request, where, replayParent, reuseLimits, settings, evidenceOpts) {
  const evidence = readCodeEvidence(ctx.paths.root, where, { ...evidenceOpts, limits: { perFileChars: settings.evidence.perItemChars, totalChars: settings.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "drill") };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const evidenceStr = subjectEvidence(evidence.evidence.files);
  const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
  const keyed = questions.map((q) => [q, answerKey(evidenceStr, q)]);
  const reused = lookupAnswers(ctx.paths, who, keyed.map(([, k]) => k), { readOnly: ctx.dryRun ?? false, reuse: reuseLimits });
  const answers = {};
  const reusedFrom = {};
  const toAsk = splitReuse(keyed, reused, answers, reusedFrom);
  if (ctx.dryRun) {
    return {
      exit: 0,
      text: dryRunText(
        { calls: toAsk.length ? 1 : 0, questions: toAsk.length, reused: keyed.length - toAsk.length, route: identity.route, baseURL: identity.baseURL },
        probeWarnings(request.mak)
      )
    };
  }
  const pre = preflight(ctx, { needsBudget: toAsk.length > 0 });
  if (!pre.ok) return pre.result;
  let costUsd;
  let costEstimated = false;
  let calls;
  let telemetry = [];
  if (toAsk.length === 0) {
    costUsd = 0;
    calls = 0;
  } else {
    const call = { state: { goal: redact(request.mak.goal), code: evidence.evidence.files }, questions: toAsk.map(([q]) => q) };
    const asked2 = await askAll(ctx, "drill", [call]);
    if (!asked2.ok) return asked2.result;
    Object.assign(answers, asked2.value.answers);
    costUsd = asked2.value.costUsd;
    costEstimated = asked2.value.costEstimated;
    telemetry = asked2.value.telemetry;
    calls = 1;
  }
  const keys = {};
  for (const [q, k] of keyed) keys[q.id] = k;
  const { consensus, escalate } = consensusAndEscalate(request.mak.categories, answers, request.mak.depth, loaded.notes, settings.lens);
  const subject = gradeSubject(request.mak.categories, answers);
  const oneSubjectNext = (gate, id) => gate === "pass" ? "act on it" : `fix it, then mm3 replay --parent ${replayParent(id)} --compare <before>..<after>`;
  const reusedRunIds = reusedIds(reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedRunIds);
  telemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFrom)];
  const response = (id, budget) => respondText(
    subjectMak(id, subject.gate, subject, [
      ["consensus", consensus],
      ["escalate", escalate],
      ...reusedRunIds.length ? [["reused", reusedRunIds]] : []
    ]),
    mdlRecorded(request.mdl),
    oneSubjectNext(subject.gate, id),
    commonNotes(
      [...loaded.notes, ...evidence.evidence.notes, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      budget,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const run = {
    verb: "drill",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where: [...where],
    parent: request.mak.parent,
    from: request.mak.from,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, where),
    mdl: request.mdl,
    ask: { categories: request.mak.categories, layers: [] },
    over: null,
    items: null,
    answers,
    keys,
    reusedFrom,
    categories: Object.fromEntries(subject.categories.map((c) => [c.name, c.gate])),
    gate: subject.gate,
    goalGate: subject.goal?.gate ?? null,
    goalP: subject.goal?.p ?? null,
    consensus,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    telemetry
  };
  const rec = calls === 0 ? recordFree(ctx, run) : record(ctx, costUsd, run);
  if (!rec.ok) return rec.result;
  return { exit: 0, text: rec.value.run.response, run: rec.value.run };
}
async function runDrill(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "drill", mdlFields, contractLimits(cfg, "drill"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const parent = findRun(ctx.paths, request.mak.parent);
  if (!parent) return { exit: 2, text: stopText([`\u2716 mak.parent: ${request.mak.parent} is not in the ledger \u2192 check the id`], "drill") };
  if (!isContractRun(parent)) return { exit: 2, text: stopText([`\u2716 mak.parent: ${parent.id} predates the YAML contract \u2192 run class or scan again`], "drill") };
  if (parent.items !== null) {
    const itemRec = parent.items[request.mak.from];
    if (!itemRec) {
      return {
        exit: 2,
        text: stopText(
          [`\u2716 mak.from: "${clip(request.mak.from, 40)}" is not an item ${parent.id} listed \u2192 use one of: ${clip(Object.keys(parent.items).join(", "), 80)}`],
          "drill"
        )
      };
    }
    if (!request.mak.over) {
      if (!itemRec.unit) {
        return {
          exit: 2,
          text: stopText(
            [
              `\u2716 mak.from: "${clip(request.mak.from, 40)}" has no code \u2192 add over: with the next layer down, or drill an item scan found (mm3 template drill --parent ${parent.id} --from ${request.mak.from})`
            ],
            "drill"
          )
        };
      }
      return runOneSubjectProof(ctx, loaded, request, [`${itemRec.unit.path}:${itemRec.unit.lines}`], (id) => id, cfg.reuse, cfg, { stopOnOversize: false });
    }
    const from = request.mak.from;
    const name = from.includes("/") ? from.slice(from.lastIndexOf("/") + 1) : from;
    const parentId = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : null;
    let itemText = name;
    if (itemRec.unit) {
      const read3 = readUnit(ctx.paths.root, itemRec.unit);
      if (!read3.ok) return { exit: 2, text: stopText([`\u2716 mak.from: the code has changed since ${parent.id} (${read3.error}) \u2192 run scan again`], "drill") };
      itemText = read3.text;
    }
    const root = { id: from, layer: itemRec.layer, name, parent: parentId, fill: itemRec.fill, text: itemText, ...itemRec.unit ? { unit: itemRec.unit } : {} };
    if (!itemRec.unit) {
      const badLayer = firstStringLayer(request.mak.over);
      if (badLayer) {
        return {
          exit: 2,
          text: stopText(
            [`\u2716 mak.over.${badLayer}: "${clip(from, 40)}" is an idea, not code \u2192 give ${badLayer} as a list of items (there is nothing to split with each)`],
            "drill"
          )
        };
      }
    }
    const notes = [];
    const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
    const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
    const plan = planSweep(
      request,
      who,
      ctx.paths,
      ctx.dryRun ?? false,
      itemRec.unit ? { resolve: createCodeResolver(ctx.paths.root, notes, cfg.evidence.maxFiles), root } : { root },
      { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence }
    );
    if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));
    const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
    if (!pre.ok) return pre.result;
    const swept = await runSweep(ctx, "drill", plan);
    if (!swept.ok) return swept.result;
    const { answers, costUsd, costEstimated, telemetry, statusOf } = swept.value;
    const categoriesOf = (layer) => request.mak.layers.find((l) => l.name === layer)?.categories ?? [];
    const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
    const goalAnswer = answers["goal"];
    const goalGrade = goalGate(goalAnswer.p);
    const gate = sweepGate(goalGrade, grades);
    const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
    const worst = worstFirst(grades.values());
    const failing = m(...worst.map((g) => sweepEntry(g)));
    const passing = graded.filter((g) => g.ownGate === "pass").length;
    const calls = plannedCallCount(plan);
    const items = itemRecords(plan.items, grades);
    const reusedFromObj = Object.fromEntries(plan.reusedFrom);
    const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
    const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];
    const response = (id, budget) => respondText(
      m(["id", id], ["gate", gate], ["goal", m(["gate", goalGrade], ["p", goalAnswer.p])], ["failing", failing], ["passing", passing]),
      mdlRecorded(request.mdl),
      worst.length ? REDRILL_NEXT : sweepNext(id, gate, worst, graded, "act on it"),
      commonNotes(
        [...loaded.notes, ...notes, ...plan.splitNotes, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
        `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
        ctx.provider.adapter,
        ctx.paths,
        ctx.notes
      )
    );
    const where = whereFromItems2(plan.items);
    const run = {
      verb: "drill",
      actor: actorOf(ctx),
      task: ctx.env.MM3_TASK?.trim() || null,
      goal: request.mak.goal,
      depth: request.mak.depth ?? null,
      where,
      parent: request.mak.parent,
      from: request.mak.from,
      compare: null,
      commit: currentCommitSha(ctx.paths.root, where),
      mdl: request.mdl,
      ask: { categories: [], layers: request.mak.layers },
      over: request.mak.over,
      items,
      answers,
      keys: Object.fromEntries(plan.keys),
      reusedFrom: Object.fromEntries(plan.reusedFrom),
      categories: {},
      gate,
      goalGate: goalGrade,
      goalP: goalAnswer.p,
      consensus: null,
      response,
      notes: [],
      adapter: ctx.provider.adapter,
      model: ctx.provider.model,
      costUsd: costUsd ?? null,
      calls,
      route: identity.route,
      baseURL: identity.baseURL,
      telemetry: fullTelemetry
    };
    return recordSweep(ctx, calls, costUsd, run);
  }
  if (request.mak.over) return { exit: 2, text: stopText([`\u2716 mak.over: ${parent.id} wasn't a sweep \u2192 remove over`], "drill") };
  if (!parent.ask.categories.some((c) => c.name === request.mak.from)) {
    return {
      exit: 2,
      text: stopText(
        [`\u2716 mak.from: "${clip(request.mak.from, 40)}" is not a category of ${parent.id} \u2192 use one of: ${parent.ask.categories.map((c) => c.name).join(", ")}`],
        "drill"
      )
    };
  }
  return runOneSubjectProof(ctx, loaded, request, parent.where, () => request.mak.parent, cfg.reuse, cfg);
}

// src/verbs/loop.ts
async function runLoop(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "loop", mdlFields, contractLimits(cfg, "loop"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, {}, { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence });
  if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;
  const ran = await runSweep(ctx, "loop", plan);
  if (!ran.ok) return ran.result;
  const { answers, costUsd, costEstimated, telemetry, statusOf } = ran.value;
  const categoriesOf = (layer) => request.mak.layers.find((l) => l.name === layer).categories;
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
  const goalAnswer = answers["goal"];
  const goal = goalAnswer ? goalGate(goalAnswer.p) : "pass";
  const gate = sweepGate(goal, grades);
  const failingIds = plan.items.filter((i) => grades.get(i.id).ownGate !== "pass").map((i) => i.id);
  const failing = m(...failingIds.map((id) => sweepEntry(grades.get(id))));
  const passing = plan.items.filter((i) => grades.get(i.id).gate === "pass").map((i) => i.id);
  const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
  const worst = worstFirst(graded);
  const calls = plannedCallCount(plan);
  const items = itemRecords(plan.items, grades);
  const reusedFromObj = Object.fromEntries(plan.reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
  const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];
  const response = (id, budget) => respondText(
    m(["id", id], ["gate", gate], ["goal", m(["gate", goal], ["p", goalAnswer?.p ?? 0])], ["failing", failing], ["passing", passing]),
    mdlRecorded(request.mdl),
    sweepNext(id, gate, worst, graded, `build it, then class the code \xB7 after the commit, mm3 replay --parent ${id} --compare <before>..HEAD`),
    commonNotes(
      [...loaded.notes, ...plan.splitNotes, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const run = {
    verb: "loop",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where: request.mak.where,
    parent: request.mak.parent ?? request.mdl?.parent ?? null,
    from: null,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, request.mak.where),
    mdl: request.mdl,
    ask: { categories: [], layers: request.mak.layers },
    over: request.mak.over,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goal,
    goalP: goalAnswer?.p ?? null,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    telemetry: fullTelemetry
  };
  return recordSweep(ctx, calls, costUsd, run);
}

// src/ledger/graph.ts
import { existsSync as existsSync15, readFileSync as readFileSync22, statSync as statSync4 } from "node:fs";
var GRAPH_SCHEMA_VERSION = "2";
var GRAPH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE(kind, label)
);
CREATE TABLE IF NOT EXISTS triples (
  p TEXT NOT NULL,
  s INTEGER NOT NULL,
  o INTEGER NOT NULL,
  run TEXT NOT NULL,
  provenance TEXT NOT NULL,
  score REAL,
  PRIMARY KEY (p, s, o, run)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_triples_spo ON triples(s, p, o);
CREATE INDEX IF NOT EXISTS idx_triples_o ON triples(o, p, s);
`;
var META_TABLE_SQL = `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;
var GraphUnavailableError = class extends Error {
  constructor() {
    super("graph: needs node:sqlite (Node \u2265 22.13) \u2192 upgrade Node to build the knowledge graph");
    this.name = "GraphUnavailableError";
  }
};
function openGraphDb(dbPath) {
  const Ctor = getSqliteCtor();
  if (!Ctor) throw new GraphUnavailableError();
  return new Ctor(dbPath);
}
function getMeta2(db, key2) {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key2);
  return row ? String(row.value) : void 0;
}
function setMeta2(db, key2, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key2, value);
}
function normalizeLabel(kind, raw) {
  let s = raw.trim();
  if (kind === "place") {
    s = stripLines(s);
    if (s.startsWith("./")) s = s.slice(2);
  }
  return s;
}
function nodeId(db, kind, rawLabel) {
  const label = normalizeLabel(kind, rawLabel);
  db.prepare("INSERT OR IGNORE INTO nodes (kind, label) VALUES (?, ?)").run(kind, label);
  const row = db.prepare("SELECT id FROM nodes WHERE kind = ? AND label = ?").get(kind, label);
  if (!row) throw new Error(`graph: node upsert failed for ${kind}:${label}`);
  return Number(row.id);
}
function addTriple(db, p, s, o, run, provenance, score) {
  db.prepare("INSERT OR IGNORE INTO triples (p, s, o, run, provenance, score) VALUES (?, ?, ?, ?, ?, ?)").run(p, s, o, run, provenance, score);
}
function runCategories2(rec) {
  return rec.ask.categories.length ? rec.ask.categories : rec.ask.layers.flatMap((l) => l.categories);
}
function runPlaces(rec) {
  const raw = rec.items ? Object.values(rec.items).flatMap((it) => it.unit ? [it.unit.path] : []) : rec.where;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const w of raw) {
    const norm = normalizeLabel("place", w);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
function parseChainPart(part) {
  const colon = part.indexOf(":");
  const level = part.slice(0, colon);
  const raw = part.slice(colon + 1);
  const name = raw.endsWith("?") ? raw.slice(0, -1) : raw;
  return { level, name };
}
function isLiteral(mdlConfig, key2) {
  return mdlConfig[key2]?.literal === true;
}
function gateScore(gate) {
  return gate === "pass" ? 1 : gate === "fail" ? 0 : gate === "unsure" ? 0.5 : null;
}
function ingestContractRun(db, rec, mdlConfig) {
  const RUN = rec.id;
  const runNode = nodeId(db, "run", RUN);
  const mdl2 = rec.mdl;
  if (mdl2?.area !== void 0 && !isLiteral(mdlConfig, "area")) {
    const areas = Array.isArray(mdl2.area) ? mdl2.area : [mdl2.area];
    for (const a of areas) addTriple(db, "about", runNode, nodeId(db, "area", a), RUN, "extracted", null);
  }
  const cats = runCategories2(rec);
  for (const cat of cats) {
    const catNode = nodeId(db, "category", cat.name);
    addTriple(db, "checks", runNode, catNode, RUN, "extracted", null);
    if (cat.family) addTriple(db, "is-a", catNode, nodeId(db, "family", cat.family), RUN, "extracted", null);
  }
  if (!rec.items) {
    const places = runPlaces(rec);
    for (const cat of cats) {
      const catNode = nodeId(db, "category", cat.name);
      const score = gateScore(rec.categories[cat.name]);
      for (const placeLabel of places) addTriple(db, "judged", catNode, nodeId(db, "place", placeLabel), RUN, "extracted", score);
    }
  } else {
    for (const layer of rec.ask.layers) {
      const layerItems = Object.values(rec.items).filter((it) => it.layer === layer.name && it.unit);
      for (const cat of layer.categories) {
        const catNode = nodeId(db, "category", cat.name);
        for (const item of layerItems) {
          const placeLabel = normalizeLabel("place", item.unit.path);
          addTriple(db, "judged", catNode, nodeId(db, "place", placeLabel), RUN, "extracted", gateScore(item.categories[cat.name]));
        }
      }
    }
  }
  const placeNodeIds = /* @__PURE__ */ new Set();
  for (const placeLabel of runPlaces(rec)) {
    const pid = nodeId(db, "place", placeLabel);
    placeNodeIds.add(pid);
    addTriple(db, "at", runNode, pid, RUN, "extracted", null);
  }
  if (rec.items) {
    for (const [id, item] of Object.entries(rec.items)) {
      const slash = id.lastIndexOf("/");
      if (slash === -1) continue;
      const parent = rec.items[id.slice(0, slash)];
      if (!parent?.unit || !item.unit) continue;
      const parentLabel = parent.unit.kind === "file" ? parent.unit.path : `${parent.unit.path}::${parent.unit.kind}:${parent.unit.name}`;
      const childLabel = item.unit.kind === "file" ? item.unit.path : `${item.unit.path}::${item.unit.kind}:${item.unit.name}`;
      addTriple(db, "contains", nodeId(db, "place", parentLabel), nodeId(db, "place", childLabel), RUN, "extracted", null);
    }
  }
  if (rec.parent) {
    const pred = rec.verb === "replay" ? "replays" : rec.verb === "drill" ? "narrows" : "builds-on";
    addTriple(db, pred, runNode, nodeId(db, "run", rec.parent), RUN, "extracted", null);
  }
  if (mdl2?.blast !== void 0 && !isLiteral(mdlConfig, "blast")) {
    addTriple(db, "reaches", runNode, nodeId(db, "level", mdl2.blast), RUN, "extracted", null);
  }
  if (mdl2?.touches !== void 0 && !isLiteral(mdlConfig, "touches")) {
    for (const t of mdl2.touches) addTriple(db, "touches", runNode, nodeId(db, "entity", t.toLowerCase().trim()), RUN, "extracted", null);
  }
  const compOrCode = /* @__PURE__ */ new Set();
  if (mdl2?.uses !== void 0 && !isLiteral(mdlConfig, "uses")) {
    for (const chain of mdl2.uses) {
      const parts = chain.split(" -> ").map(parseChainPart);
      const partNodeIds = parts.map((part) => nodeId(db, part.level, part.name));
      for (let i = 0; i < partNodeIds.length - 1; i++) addTriple(db, "uses", partNodeIds[i], partNodeIds[i + 1], RUN, "declared", null);
      parts.forEach((part, i) => {
        if (part.level === "component" || part.level === "code") compOrCode.add(partNodeIds[i]);
      });
      for (const part of parts) {
        const segs = part.name.split("/");
        if (segs.length < 2) continue;
        for (let i = 1; i < segs.length; i++) {
          const parentLabel = segs.slice(0, i).join("/");
          const childLabel = segs.slice(0, i + 1).join("/");
          const childKind = i + 1 === segs.length ? part.level : "container";
          const childNode = nodeId(db, childKind, childLabel);
          addTriple(db, "contains", nodeId(db, "container", parentLabel), childNode, RUN, "declared", null);
          if (childKind === "component" || childKind === "code") compOrCode.add(childNode);
        }
      }
    }
  }
  for (const placeId of placeNodeIds) for (const compId of compOrCode) addTriple(db, "contains", placeId, compId, RUN, "inferred", null);
  const extras = mdl2?.extras;
  if (extras) {
    const places = runPlaces(rec);
    for (const [key2, rawValue] of Object.entries(extras)) {
      const override = mdlConfig[key2];
      if (!override) continue;
      const predicate = override.as ?? key2;
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const v of values) {
        const valueNode = nodeId(db, "value", v.toLowerCase().trim());
        addTriple(db, predicate, runNode, valueNode, RUN, "declared", null);
        if (override.link === "where") {
          for (const placeLabel of places) addTriple(db, "handled-by", valueNode, nodeId(db, "place", placeLabel), RUN, "declared", null);
        }
      }
    }
  }
}
function ingestOutcome(db, rec) {
  const runNode = nodeId(db, "run", rec.of);
  const outcomeNode = nodeId(db, "outcome", rec.outcome);
  addTriple(db, "resolved-as", runNode, outcomeNode, rec.of, "extracted", null);
}
function resetGraphSchema(db) {
  db.exec("DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS triples;");
  db.exec(GRAPH_SCHEMA_SQL);
  setMeta2(db, "graph_upto", "0");
  setMeta2(db, "graph_schema_version", GRAPH_SCHEMA_VERSION);
}
function scanCompleteLines(buf, from, to) {
  const lines = [];
  let pos = from;
  for (; ; ) {
    const nl = buf.indexOf(10, pos);
    if (nl === -1 || nl >= to) break;
    lines.push(buf.subarray(pos, nl).toString("utf8"));
    pos = nl + 1;
  }
  return { consumed: pos, lines };
}
function needsCatchUp(paths, logSize) {
  if (!existsSync15(paths.index)) return true;
  let db;
  try {
    db = openGraphDb(paths.index);
  } catch {
    return true;
  }
  try {
    db.exec(META_TABLE_SQL);
    if (getMeta2(db, "graph_schema_version") !== GRAPH_SCHEMA_VERSION) return true;
    return Number(getMeta2(db, "graph_upto") ?? "0") < logSize;
  } catch {
    return true;
  } finally {
    db.close();
  }
}
function catchUpGraph(paths, env) {
  ensureDir(paths);
  const db = openGraphDb(paths.index);
  try {
    db.exec(META_TABLE_SQL);
    if (getMeta2(db, "graph_schema_version") !== GRAPH_SCHEMA_VERSION) resetGraphSchema(db);
    const upto = Number(getMeta2(db, "graph_upto") ?? "0");
    const size = existsSync15(paths.log) ? statSync4(paths.log).size : 0;
    if (upto >= size) return;
    const buf = readFileSync22(paths.log);
    const { consumed, lines } = scanCompleteLines(buf, upto, size);
    const mdlConfig = resolveConfig(paths, env).config.mdl;
    db.exec("BEGIN");
    try {
      for (const raw of lines) {
        const line3 = raw.trim();
        if (!line3) continue;
        let parsed;
        try {
          parsed = JSON.parse(line3);
        } catch {
          continue;
        }
        if (!parsed || typeof parsed !== "object") continue;
        const rec = normalizeRecordMdl(parsed);
        if (rec.kind === "run" && isContractRun(rec)) ingestContractRun(db, rec, mdlConfig);
        else if (rec.kind === "outcome") ingestOutcome(db, rec);
      }
      setMeta2(db, "graph_upto", String(consumed));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    db.close();
  }
}
function refreshGraph(paths, env = process.env) {
  const logStat = existsSync15(paths.log) ? statSync4(paths.log) : void 0;
  if (!logStat || logStat.size === 0) return;
  if (!needsCatchUp(paths, logStat.size)) return;
  withLock(paths.lock, () => catchUpGraph(paths, env));
}
var EMPTY_NEIGHBORHOOD = { nodes: [], edges: [] };
function graphAround(paths, opts) {
  if (!existsSync15(paths.index)) return EMPTY_NEIGHBORHOOD;
  const db = openGraphDb(paths.index);
  try {
    const label = normalizeLabel(opts.kind, opts.label);
    const start = db.prepare("SELECT id FROM nodes WHERE kind = ? AND label = ?").get(opts.kind, label);
    if (!start) return EMPTY_NEIGHBORHOOD;
    const depth = Math.min(Math.max(opts.depth ?? 2, 0), 6);
    const startId = Number(start.id);
    const visited = /* @__PURE__ */ new Set([startId]);
    let frontier = [startId];
    const outStmt = db.prepare("SELECT p, s, o, run, provenance, score FROM triples WHERE s = ?");
    const inStmt = db.prepare("SELECT p, s, o, run, provenance, score FROM triples WHERE o = ?");
    const edgeSeen = /* @__PURE__ */ new Set();
    const edges = [];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next = [];
      for (const id of frontier) {
        for (const row of [...outStmt.all(id), ...inStmt.all(id)]) {
          const edge = { p: String(row.p), s: Number(row.s), o: Number(row.o), run: String(row.run), provenance: String(row.provenance), score: row.score === null || row.score === void 0 ? null : Number(row.score) };
          const key2 = `${edge.p}\0${edge.s}\0${edge.o}\0${edge.run}`;
          if (!edgeSeen.has(key2)) {
            edgeSeen.add(key2);
            edges.push(edge);
          }
          const other = edge.s === id ? edge.o : edge.s;
          if (!visited.has(other)) {
            visited.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    const ids = [...visited];
    const nodeRows = ids.length ? db.prepare(`SELECT id, kind, label FROM nodes WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) : [];
    return { nodes: nodeRows.map((r) => ({ id: Number(r.id), kind: String(r.kind), label: String(r.label) })), edges };
  } catch {
    return EMPTY_NEIGHBORHOOD;
  } finally {
    db.close();
  }
}
function mdlRows(paths, opts = {}) {
  if (!existsSync15(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1e3);
    const rows = db.prepare(
      `SELECT id, verb, ts,
           json_extract(mdl, '$.mdl.why') AS why,
           json_extract(mdl, '$.mdl.area') AS area,
           json_extract(mdl, '$.mdl.stage') AS stage,
           json_extract(mdl, '$.mdl.change') AS change,
           json_extract(mdl, '$.mdl.risk') AS risk,
           json_extract(mdl, '$.mdl.problem') AS problem,
           json_extract(mdl, '$.mdl.blast') AS blast
         FROM runs ORDER BY ts DESC LIMIT ?`
    ).all(limit);
    return rows.map((r) => ({
      id: String(r.id),
      verb: String(r.verb),
      ts: String(r.ts),
      why: r.why === null || r.why === void 0 ? null : String(r.why),
      area: r.area === null || r.area === void 0 ? null : String(r.area),
      stage: r.stage === null || r.stage === void 0 ? null : String(r.stage),
      change: r.change === null || r.change === void 0 ? null : String(r.change),
      risk: r.risk === null || r.risk === void 0 ? null : String(r.risk),
      problem: r.problem === null || r.problem === void 0 ? null : String(r.problem),
      blast: r.blast === null || r.blast === void 0 ? null : String(r.blast)
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}
function problemCounts(paths, opts = {}) {
  if (!existsSync15(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 500);
    const rows = db.prepare(
      `SELECT c.family AS family, p.val AS place,
           SUM(CASE WHEN c.gate = 'pass' THEN 1 ELSE 0 END) AS pass,
           SUM(CASE WHEN c.gate = 'fail' THEN 1 ELSE 0 END) AS fail,
           SUM(CASE WHEN c.gate = 'unsure' THEN 1 ELSE 0 END) AS unsure
         FROM categories c
         JOIN places p ON p.run_id = c.run_id AND p.kind = 'where'
         WHERE c.family IS NOT NULL AND c.gate IS NOT NULL
         GROUP BY c.family, p.val
         ORDER BY fail DESC, unsure DESC
         LIMIT ?`
    ).all(limit);
    return rows.map((r) => ({ family: String(r.family), place: String(r.place), pass: Number(r.pass), fail: Number(r.fail), unsure: Number(r.unsure) }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}
function callStats(paths, opts = {}) {
  if (!existsSync15(paths.index)) return [];
  const since = opts.sinceIso ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5e3);
  let rows;
  const db = openGraphDb(paths.index);
  try {
    rows = db.prepare("SELECT offset, verb, ts FROM runs WHERE ts >= ? ORDER BY ts DESC LIMIT ?").all(since, limit);
  } catch {
    return [];
  } finally {
    db.close();
  }
  const agg = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const rec = readRecordAt(paths.log, Number(row.offset));
    if (!rec || !isContractRun(rec)) continue;
    const day = String(row.ts).slice(0, 10);
    if (rec.telemetry && rec.telemetry.length) {
      for (const t of rec.telemetry) {
        const model = t.source === "provider" ? t.model : "reused";
        const key2 = `${day}\0${rec.verb}\0${model}\0${t.source}`;
        const cur = agg.get(key2) ?? { day, verb: rec.verb, model, source: t.source, calls: 0, tokens: 0, costUsd: 0, savedUsd: 0 };
        cur.calls += 1;
        if (t.source === "provider") {
          cur.tokens += (t.inputTokens ?? 0) + (t.outputTokens ?? 0);
          cur.costUsd += t.costUsd ?? 0;
        } else {
          cur.tokens += t.original.inputTokens ?? 0;
          cur.savedUsd += t.savedUsd ?? 0;
        }
        agg.set(key2, cur);
      }
    } else if (rec.calls > 0) {
      const key2 = `${day}\0${rec.verb}\0${rec.model}\0none`;
      const cur = agg.get(key2) ?? { day, verb: rec.verb, model: rec.model, source: "none", calls: 0, tokens: 0, costUsd: 0, savedUsd: 0 };
      cur.calls += rec.calls;
      cur.costUsd += rec.costUsd ?? 0;
      agg.set(key2, cur);
    }
  }
  return [...agg.values()];
}
var MAX_UNDECLARED_KEYS = 50;
var MAX_VALUES_PER_KEY = 200;
var MAX_SAMPLES_PER_KEY = 5;
function undeclaredFieldSamples(paths, opts) {
  if (!existsSync15(paths.index)) return [];
  const db = openGraphDb(paths.index);
  try {
    const known = new Set(opts.knownKeys);
    const rows = db.prepare("SELECT mdl FROM runs WHERE mdl IS NOT NULL").all();
    const byKey = /* @__PURE__ */ new Map();
    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(String(row.mdl));
      } catch {
        continue;
      }
      const extras = parsed?.mdl?.extras;
      if (!extras || typeof extras !== "object") continue;
      for (const [key2, rawValue] of Object.entries(extras)) {
        if (known.has(key2)) continue;
        let entry = byKey.get(key2);
        if (!entry) {
          if (byKey.size >= MAX_UNDECLARED_KEYS) continue;
          entry = { count: 0, values: [] };
          byKey.set(key2, entry);
        }
        entry.count += 1;
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const v of values) {
          const s = String(v);
          if (entry.values.length < MAX_VALUES_PER_KEY && !entry.values.includes(s)) entry.values.push(s);
        }
      }
    }
    return [...byKey.entries()].map(([key2, e]) => ({ key: key2, count: e.count, samples: e.values.slice(0, MAX_SAMPLES_PER_KEY), values: e.values }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

// src/verbs/report-web.ts
import { writeFileSync as writeFileSync9 } from "node:fs";
import path23 from "node:path";
var DAY_MS = 24 * 60 * 60 * 1e3;
var LIST_CAP = 12;
var GATE_RANK = { fail: 0, unsure: 1, pass: 2 };
function normalizeQuestion(text) {
  return text.toLowerCase().replace(/\{[a-z_]+\}/gu, " ").replace(/[^a-z0-9 ]/gu, " ").replace(/\s+/gu, " ").trim();
}
function placeSummary(rec) {
  const direct = rec.where.map(stripLines).filter(Boolean);
  if (direct.length) return direct.join(", ");
  const sweep = sweepPlaces(rec).filter((p) => p.kind === "where").map((p) => p.val);
  return sweep.length ? sweep.join(", ") : "(no place)";
}
function mdlTags(rec) {
  const w = rec.mdl;
  if (!w) return [];
  const tags = [];
  if (w.why) tags.push(`why:${w.why}`);
  if (w.area) tags.push(`area:${w.area}`);
  if (w.stage) tags.push(`stage:${w.stage}`);
  if (w.change) tags.push(`change:${w.change}`);
  if (w.risk) tags.push(`risk:${w.risk}`);
  return tags;
}
function meanP(answers, ns, prefix) {
  const ps = [];
  for (const n of ns) {
    const a = answers[`${prefix}${n}`];
    if (a && a.kind === "yesno") ps.push(a.p);
  }
  return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : null;
}
function questionFingerprint(cat) {
  return cat.questions.map((q) => normalizeQuestion(q.text)).sort().join("|");
}
function collectEdges(runs) {
  const edges = [];
  const runTags = /* @__PURE__ */ new Map();
  for (const rec of runs) {
    runTags.set(rec.id, mdlTags(rec));
    if (rec.items) {
      const layerCats = /* @__PURE__ */ new Map();
      for (const layer of rec.ask.layers) layerCats.set(layer.name, layer.categories);
      for (const [itemKey, item] of Object.entries(rec.items)) {
        const place = item.unit?.path;
        if (!place) continue;
        for (const cat of layerCats.get(item.layer) ?? []) {
          const gate = item.categories?.[cat.name];
          if (gate === void 0) continue;
          const ns = cat.questions.map((q) => q.n);
          const p = meanP(rec.answers, ns, `${itemKey}#`);
          edges.push({ runId: rec.id, place, concern: cat.name.toLowerCase(), gate, p, qtext: questionFingerprint(cat), ts: rec.ts });
        }
      }
    } else {
      const places = rec.where.map(stripLines).filter(Boolean);
      if (!places.length) continue;
      for (const cat of rec.ask.categories) {
        const gate = rec.categories[cat.name];
        if (gate === void 0) continue;
        const ns = cat.questions.map((q) => q.n);
        const p = meanP(rec.answers, ns, "");
        const qtext = questionFingerprint(cat);
        for (const place of places) edges.push({ runId: rec.id, place, concern: cat.name.toLowerCase(), gate, p, qtext, ts: rec.ts });
      }
    }
  }
  return { edges, runTags };
}
function rollup(verdicts) {
  if (!verdicts.length) return "none";
  if (verdicts.includes("conflict")) return "conflict";
  const gates = verdicts.filter((v) => v === "pass" || v === "fail" || v === "unsure");
  if (!gates.length) return "none";
  return [...gates].sort((a, b) => GATE_RANK[a] - GATE_RANK[b])[0];
}
function buildOutcomes(runs, outcomes) {
  const latest = /* @__PURE__ */ new Map();
  for (const o of outcomes) latest.set(o.of, o.outcome);
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  for (const outcome of latest.values()) counts[outcome]++;
  for (const r of runs) {
    if ((r.gate === "fail" || r.gate === "unsure") && !latest.has(r.id)) counts.open++;
  }
  return counts;
}
function formatUsd(n) {
  if (!n) return "$0.00";
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  let s = n.toPrecision(2);
  if (s.includes("e")) s = n.toFixed(6);
  return `$${s}`;
}
function mergePathAliases(places) {
  const sorted = [...new Set(places)].sort((a, b) => a.length - b.length);
  const canonicalOf = /* @__PURE__ */ new Map();
  for (let i = 0; i < sorted.length; i++) {
    const short = sorted[i];
    if (canonicalOf.has(short)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const long = sorted[j];
      if (!canonicalOf.has(long) && long.endsWith(`/${short}`)) canonicalOf.set(long, short);
    }
  }
  return { canonicalOf, merged: canonicalOf.size };
}
function buildArcs(pcMap) {
  const fixes = [];
  const regressions = [];
  for (const [key2, hits] of pcMap) {
    if (hits.length < 2) continue;
    const [place, concern] = key2.split("\0");
    const byTs = [...hits].sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    const first = byTs[0];
    const last = byTs[byTs.length - 1];
    if (first.gate === "fail" && last.gate === "pass") fixes.push({ place, concern, fromId: first.runId, toId: last.runId, ts: last.ts });
    else if (first.gate === "pass" && last.gate === "fail") regressions.push({ place, concern, fromId: first.runId, toId: last.runId, ts: last.ts });
  }
  const byNewest = (a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0;
  const strip = ({ place, concern, fromId, toId }) => ({ place, concern, fromId, toId });
  return { fixes: fixes.sort(byNewest).map(strip), regressions: regressions.sort(byNewest).map(strip) };
}
function buildWindow(records) {
  const runs = records.filter(isContractRun);
  const legacyRuns = records.filter(isRun);
  const outcomes = records.filter((r) => r.kind === "outcome");
  const failed2 = records.filter((r) => r.kind === "failed");
  const { edges: rawEdges, runTags } = collectEdges(runs);
  const { canonicalOf, merged: pathsMerged } = mergePathAliases(rawEdges.map((e) => e.place));
  const edges = canonicalOf.size ? rawEdges.map((e) => canonicalOf.has(e.place) ? { ...e, place: canonicalOf.get(e.place) } : e) : rawEdges;
  const placeConcerns = /* @__PURE__ */ new Map();
  const placeRuns = /* @__PURE__ */ new Map();
  const placeTags = /* @__PURE__ */ new Map();
  const concernRuns = /* @__PURE__ */ new Map();
  const concernPlaces = /* @__PURE__ */ new Map();
  const tagRuns = /* @__PURE__ */ new Map();
  const tagPlaces = /* @__PURE__ */ new Map();
  const pcMap = /* @__PURE__ */ new Map();
  for (const e of edges) {
    if (!placeConcerns.has(e.place)) placeConcerns.set(e.place, /* @__PURE__ */ new Set());
    placeConcerns.get(e.place).add(e.concern);
    if (!placeRuns.has(e.place)) placeRuns.set(e.place, /* @__PURE__ */ new Set());
    placeRuns.get(e.place).add(e.runId);
    if (!concernRuns.has(e.concern)) concernRuns.set(e.concern, /* @__PURE__ */ new Set());
    concernRuns.get(e.concern).add(e.runId);
    if (!concernPlaces.has(e.concern)) concernPlaces.set(e.concern, /* @__PURE__ */ new Set());
    concernPlaces.get(e.concern).add(e.place);
    for (const tag of runTags.get(e.runId) ?? []) {
      if (!placeTags.has(e.place)) placeTags.set(e.place, /* @__PURE__ */ new Set());
      placeTags.get(e.place).add(tag);
      if (!tagRuns.has(tag)) tagRuns.set(tag, /* @__PURE__ */ new Set());
      tagRuns.get(tag).add(e.runId);
      if (!tagPlaces.has(tag)) tagPlaces.set(tag, /* @__PURE__ */ new Set());
      tagPlaces.get(tag).add(e.place);
    }
    const key2 = `${e.place}\0${e.concern}`;
    if (!pcMap.has(key2)) pcMap.set(key2, []);
    pcMap.get(key2).push(e);
  }
  const pairStats = /* @__PURE__ */ new Map();
  for (const [key2, hits] of pcMap) {
    const runIds = [...new Set(hits.map((h) => h.runId))];
    const uniqGates = [...new Set(hits.map((h) => h.gate))];
    const status = uniqGates.length > 1 ? "CONFLICT" : runIds.length >= 2 ? "STRONG" : "SINGLE";
    const verdict2 = uniqGates.length > 1 ? "conflict" : uniqGates[0];
    const ps = hits.map((h) => h.p).filter((p) => p !== null);
    const spread = ps.length ? Math.max(...ps) - Math.min(...ps) : null;
    const sameChecklist = new Set(hits.map((h) => h.qtext)).size <= 1;
    pairStats.set(key2, { status, verdict: verdict2, spread, sameChecklist, runIds, uniqGates });
  }
  const places = [...placeConcerns.keys()].sort();
  const layerNames = /* @__PURE__ */ new Map();
  for (const place of places) {
    const dir = path23.posix.dirname(place);
    const layer = dir === "." ? "(root)" : dir;
    if (!layerNames.has(layer)) layerNames.set(layer, []);
    layerNames.get(layer).push(place);
  }
  const layers = [...layerNames.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, layerPlaces]) => ({
    name,
    cards: layerPlaces.map((place) => {
      const concerns2 = [...placeConcerns.get(place)].sort().map((name2) => ({ name: name2, verdict: pairStats.get(`${place}\0${name2}`).verdict }));
      return {
        place,
        verdict: rollup(concerns2.map((c) => c.verdict)),
        runCount: placeRuns.get(place).size,
        concerns: concerns2,
        tags: [...placeTags.get(place) ?? []].sort()
      };
    })
  }));
  const concerns = [
    ...[...concernRuns.entries()].map(([name, runIds]) => ({ key: name, label: name, kind: "category", count: runIds.size, places: [...concernPlaces.get(name) ?? []].sort() })),
    ...[...tagRuns.entries()].map(([tag, runIds]) => ({ key: tag, label: tag, kind: "tag", count: runIds.size, places: [...tagPlaces.get(tag) ?? []].sort() }))
  ].sort((a, b) => b.count - a.count || (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "category" ? -1 : 1));
  const concernNames = [...concernRuns.keys()].sort();
  const cells = [];
  for (const place of places) {
    for (const concern of concernNames) {
      const stat = pairStats.get(`${place}\0${concern}`);
      if (!stat) {
        cells.push({ place, concern, verdict: "none", status: "NONE", runs: 0, gates: [], spread: null, sameChecklist: null, title: `${place} \xB7 ${concern} \xB7 no runs` });
        continue;
      }
      const spreadText = stat.spread === null ? "n/a" : stat.spread.toFixed(2);
      const sameChecklist = stat.status === "CONFLICT" ? stat.sameChecklist : null;
      const checklistNote = sameChecklist === null ? "" : sameChecklist ? " \xB7 same checklist reused, verdict moved \u2014 real signal" : " \xB7 different questions asked under this name \u2014 may not be comparable";
      cells.push({
        place,
        concern,
        verdict: stat.verdict,
        status: stat.status,
        runs: stat.runIds.length,
        gates: stat.uniqGates,
        spread: stat.spread,
        sameChecklist,
        title: `${place} \xB7 ${concern} \xB7 ${stat.status} \xB7 runs ${stat.runIds.length} \xB7 gate ${stat.uniqGates.join("/")} \xB7 P(yes) spread ${spreadText}${checklistNote}`
      });
    }
  }
  const { fixes, regressions } = buildArcs(pcMap);
  const canonicalPlace = (p) => canonicalOf.get(p) ?? p;
  const findings = runs.filter((r) => r.gate === "fail").sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0).slice(0, LIST_CAP).map((r) => ({ id: r.id, place: placeSummary(r).split(", ").map(canonicalPlace).join(", "), goal: r.goal, ts: r.ts }));
  const actors = /* @__PURE__ */ new Set();
  for (const r of runs) actors.add(r.actor);
  for (const r of legacyRuns) actors.add(r.actor);
  let paidCalls = 0;
  let spendUsd = 0;
  for (const r of runs) {
    paidCalls += r.calls;
    if (r.costUsd) spendUsd += r.costUsd;
  }
  for (const r of legacyRuns) {
    if (r.costUsd) {
      spendUsd += r.costUsd;
      paidCalls += 1;
    }
  }
  for (const f of failed2) if (f.costUsd) spendUsd += f.costUsd;
  let dateFrom = null;
  let dateTo = null;
  for (const r of records) {
    if (dateFrom === null || r.ts < dateFrom) dateFrom = r.ts;
    if (dateTo === null || r.ts > dateTo) dateTo = r.ts;
  }
  const story = {
    runs: runs.length + legacyRuns.length,
    paidCalls,
    spendUsd,
    actors: [...actors].sort(),
    dateFrom,
    dateTo,
    fixes: fixes.slice(0, LIST_CAP),
    regressions: regressions.slice(0, LIST_CAP),
    findings,
    outcomes: buildOutcomes(runs, outcomes),
    pathsMerged
  };
  return { layers, concerns, heatmap: { places, concerns: concernNames, cells }, story };
}
function buildViewerData(records, nowMs = Date.now()) {
  const cutoff = nowMs - 30 * DAY_MS;
  const recent = records.filter((r) => new Date(r.ts).getTime() >= cutoff);
  return { generatedAt: new Date(nowMs).toISOString(), windows: { all: buildWindow(records), last30: buildWindow(recent) } };
}
function escapeForInlineJson(json) {
  return json.replace(/&/gu, "\\u0026").replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/\u2028/gu, "\\u2028").replace(/\u2029/gu, "\\u2029");
}
var CSS = `
:root {
  --bg:#f5f3ef; --surface:#ffffff; --surface2:#efece6; --surface3:#e6e2da;
  --border:#e2ded6; --border2:#c9c4ba;
  --text:#151412; --muted:#6b6862; --faint:#a09c94;
  --accent:#d4531e; --accent-bg:rgba(212,83,30,.12);
  --run:#2f8a5b; --run-bg:rgba(47,138,91,.12);
  --wait:#a8781a; --wait-bg:rgba(168,120,26,.14);
  --park:#2f6fc4; --park-bg:rgba(47,111,196,.12);
  --done:#8a877f; --done-bg:rgba(138,135,127,.16);
  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --r-control:5px; --r-card:6px;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0c0c0c; --surface:#121212; --surface2:#1a1a1a; --surface3:#222222;
    --border:#262626; --border2:#383838;
    --text:#f2efe9; --muted:#8f8c86; --faint:#5c5a56;
    --accent:#e5622b; --accent-bg:rgba(229,98,43,.14);
    --run:#5ea87f; --run-bg:rgba(94,168,127,.14);
    --wait:#d4a54a; --wait-bg:rgba(212,165,74,.14);
    --park:#6b9bd8; --park-bg:rgba(107,155,216,.14);
    --done:#6b6b66; --done-bg:rgba(107,107,102,.18);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg:#0c0c0c; --surface:#121212; --surface2:#1a1a1a; --surface3:#222222;
  --border:#262626; --border2:#383838;
  --text:#f2efe9; --muted:#8f8c86; --faint:#5c5a56;
  --accent:#e5622b; --accent-bg:rgba(229,98,43,.14);
  --run:#5ea87f; --run-bg:rgba(94,168,127,.14);
  --wait:#d4a54a; --wait-bg:rgba(212,165,74,.14);
  --park:#6b9bd8; --park-bg:rgba(107,155,216,.14);
  --done:#6b6b66; --done-bg:rgba(107,107,102,.18);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:var(--bg); color:var(--text); }
body { font-family:var(--font-ui); font-size:13px; line-height:1.5; }
.label { font-family:var(--font-mono); font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:600; }
button { font-family:inherit; font-size:inherit; color:inherit; background:none; border:none; cursor:pointer; }
h1,h2,h3,p,ul { margin:0; }

.topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--surface); flex-wrap:wrap; }
.topbar-left { display:flex; align-items:center; gap:14px; }
.brand { font-weight:700; letter-spacing:.03em; font-size:12px; }
.tabs { display:flex; gap:4px; }
.tab-btn { padding:6px 12px; border-radius:var(--r-control); color:var(--muted); }
.tab-btn[aria-selected="true"] { background:var(--surface2); color:var(--text); font-weight:600; }
.topbar-right { display:flex; align-items:center; gap:8px; }
.range-group { display:flex; border:1px solid var(--border2); border-radius:var(--r-control); overflow:hidden; }
.range-btn { padding:5px 10px; color:var(--muted); }
.range-btn[aria-pressed="true"] { background:var(--surface2); color:var(--text); font-weight:600; }
.icon-btn { border:1px solid var(--border2); border-radius:var(--r-control); padding:5px 10px; }

.layout { display:grid; grid-template-columns: 220px 1fr 300px; align-items:start; }
.rail { padding:14px; }
.rail-left { border-right:1px solid var(--border); position:sticky; top:0; }
.rail-right { border-left:1px solid var(--border); background:var(--surface); }
.center { padding:16px; min-width:0; }

.concern-row { display:flex; width:100%; justify-content:space-between; align-items:center; gap:8px; padding:6px 8px; border-radius:var(--r-control); margin-bottom:2px; text-align:left; }
.concern-row:hover { background:var(--surface2); }
.concern-row.active { background:var(--accent-bg); color:var(--accent); font-weight:600; }
.concern-name { font-family:var(--font-mono); font-size:11.5px; overflow-wrap:anywhere; }
.concern-count { font-family:var(--font-mono); color:var(--muted); font-size:11px; }

.layer { margin-bottom:22px; }
.layer-head { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
.layer-num { font-family:var(--font-mono); font-size:11px; color:var(--muted); border:1px solid var(--border2); border-radius:3px; padding:1px 6px; }
.layer-name { font-family:var(--font-mono); font-weight:700; font-size:12.5px; }
.card-grid { display:flex; flex-wrap:wrap; gap:10px; }
.card { width:220px; border:1px solid var(--border2); border-left-width:4px; border-radius:var(--r-card); background:var(--surface); padding:10px; transition:opacity .15s; }
.card.dim { opacity:.25; }
.card.hl { outline:2px solid var(--accent); outline-offset:1px; }
.card-title { font-family:var(--font-mono); font-size:11.5px; overflow-wrap:anywhere; margin-bottom:4px; }
.card-meta { color:var(--muted); font-size:11px; margin-bottom:6px; }
.chip-row { display:flex; flex-wrap:wrap; gap:4px; }
.chip { font-family:var(--font-mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; padding:2px 6px; border-radius:3px; border:1px solid var(--border2); }

.v-pass { border-left-color:var(--run); } .chip.v-pass, .heat-cell.v-pass { background:var(--run-bg); color:var(--run); }
.v-fail { border-left-color:var(--accent); } .chip.v-fail, .heat-cell.v-fail { background:var(--accent-bg); color:var(--accent); }
.v-unsure { border-left-color:var(--wait); } .chip.v-unsure, .heat-cell.v-unsure { background:var(--wait-bg); color:var(--wait); }
.v-conflict { border-left-color:var(--park); } .chip.v-conflict, .heat-cell.v-conflict { background:var(--park-bg); color:var(--park); }
.v-none { border-left-color:var(--done); } .chip.v-none, .heat-cell.v-none { background:var(--done-bg); color:var(--muted); }

.heat-table-wrap { overflow:auto; max-width:100%; }
.heat-table { border-collapse:collapse; font-size:12px; }
.heat-table th, .heat-table td { border:1px solid var(--border); padding:0; }
.heat-table th.col-label { padding:6px 4px; font-family:var(--font-mono); font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); white-space:nowrap; }
.heat-table th.row-label { text-align:left; padding:4px 8px; font-family:var(--font-mono); font-size:11px; white-space:nowrap; background:var(--surface); }
.heat-table th.corner { background:var(--surface); }
.heat-cell { width:26px; height:22px; }

.story-section { margin-bottom:18px; }
.story-section .label { display:block; margin-bottom:6px; }
.stat-row { display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; font-size:12px; }
.stat-row .k { color:var(--muted); }
ul.story-list { list-style:none; font-family:var(--font-mono); font-size:11px; }
ul.story-list li { padding:3px 0; border-bottom:1px solid var(--border); overflow-wrap:anywhere; }
.muted { color:var(--muted); }

.viewer-footer { text-align:center; padding:14px; color:var(--faint); font-size:11px; border-top:1px solid var(--border); }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .rail-left, .rail-right { border:none; border-top:1px solid var(--border); position:static; }
}
`;
var BODY2 = `
<header class="topbar">
  <div class="topbar-left">
    <span class="brand">MM3</span>
    <nav class="tabs" role="tablist">
      <button class="tab-btn" type="button" data-tab="map" aria-selected="true" role="tab">Map</button>
      <button class="tab-btn" type="button" data-tab="heat" aria-selected="false" role="tab">Heat map</button>
    </nav>
  </div>
  <div class="topbar-right">
    <div class="range-group" role="group" aria-label="time range">
      <button class="range-btn" type="button" data-range="all" aria-pressed="true">All</button>
      <button class="range-btn" type="button" data-range="last30" aria-pressed="false">Last 30 days</button>
    </div>
    <button class="icon-btn" type="button" id="theme-btn" title="Toggle light/dark">Theme</button>
  </div>
</header>
<div class="layout">
  <aside class="rail rail-left">
    <span class="label">Concerns</span>
    <div id="rail-concerns"></div>
  </aside>
  <main class="center">
    <section id="tab-map" class="tab-panel">
      <div id="map-layers"></div>
    </section>
    <section id="tab-heat" class="tab-panel" hidden>
      <div class="heat-table-wrap" id="heat-host"></div>
    </section>
  </main>
  <aside class="rail rail-right">
    <span class="label">Session story</span>
    <div class="story-section">
      <div class="stat-row"><span class="k">Runs</span><span id="story-runs"></span></div>
      <div class="stat-row"><span class="k">Paid calls</span><span id="story-calls"></span></div>
      <div class="stat-row"><span class="k">Spend</span><span id="story-spend"></span></div>
      <div class="stat-row"><span class="k">Actors</span><span id="story-actors"></span></div>
      <div class="stat-row"><span class="k">Range</span><span id="story-range"></span></div>
      <div class="stat-row"><span class="k">Paths merged</span><span id="story-merged"></span></div>
    </div>
    <div class="story-section">
      <span class="label">Fixes held</span>
      <ul class="story-list" id="story-fixes"></ul>
    </div>
    <div class="story-section">
      <span class="label">Regressions</span>
      <ul class="story-list" id="story-regressions"></ul>
    </div>
    <div class="story-section">
      <span class="label">Latest findings</span>
      <ul class="story-list" id="story-findings"></ul>
    </div>
    <div class="story-section">
      <span class="label">Outcomes</span>
      <div id="story-outcomes" class="muted"></div>
    </div>
  </aside>
</div>
<footer class="viewer-footer">Make and model \xB7 MM3</footer>
`;
var CLIENT_JS = `
(function () {
  'use strict';
  var raw = document.getElementById('viewer-data').textContent;
  var data = JSON.parse(raw);
  var state = { range: 'all', tab: 'map', highlight: null };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function setText(id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  }
  function currentWindow() { return data.windows[state.range]; }
  function verdictClass(v) { return 'v-' + v; }

  function renderConcerns() {
    var host = document.getElementById('rail-concerns');
    host.textContent = '';
    var w = currentWindow();
    if (!w.concerns.length) { host.appendChild(el('p', 'muted', 'none yet')); return; }
    w.concerns.forEach(function (c) {
      var row = el('button', 'concern-row');
      row.type = 'button';
      if (state.highlight === c.key) row.classList.add('active');
      row.appendChild(el('span', 'concern-name', c.label));
      row.appendChild(el('span', 'concern-count', String(c.count)));
      row.addEventListener('click', function () {
        state.highlight = state.highlight === c.key ? null : c.key;
        render();
      });
      host.appendChild(row);
    });
  }

  function renderMap() {
    var host = document.getElementById('map-layers');
    host.textContent = '';
    var w = currentWindow();
    if (!w.layers.length) { host.appendChild(el('p', 'muted', 'No runs recorded yet.')); return; }
    w.layers.forEach(function (layer, i) {
      var sec = el('section', 'layer');
      var head = el('div', 'layer-head');
      head.appendChild(el('span', 'layer-num', String(i + 1)));
      head.appendChild(el('span', 'layer-name', layer.name));
      sec.appendChild(head);
      var grid = el('div', 'card-grid');
      layer.cards.forEach(function (card) {
        var concernNames = card.concerns.map(function (x) { return x.name; });
        var c = el('article', 'card ' + verdictClass(card.verdict));
        if (state.highlight) {
          var hit = concernNames.indexOf(state.highlight) !== -1 || card.tags.indexOf(state.highlight) !== -1;
          c.classList.add(hit ? 'hl' : 'dim');
        }
        c.appendChild(el('div', 'card-title', card.place));
        c.appendChild(el('div', 'card-meta', card.runCount + (card.runCount === 1 ? ' run' : ' runs')));
        var chips = el('div', 'chip-row');
        card.concerns.forEach(function (cc) { chips.appendChild(el('span', 'chip ' + verdictClass(cc.verdict), cc.name)); });
        c.appendChild(chips);
        grid.appendChild(c);
      });
      sec.appendChild(grid);
      host.appendChild(sec);
    });
  }

  function renderHeat() {
    var host = document.getElementById('heat-host');
    host.textContent = '';
    var w = currentWindow();
    if (!w.heatmap.places.length || !w.heatmap.concerns.length) { host.appendChild(el('p', 'muted', 'No runs recorded yet.')); return; }
    var table = el('table', 'heat-table');
    var thead = el('thead');
    var hr = el('tr');
    hr.appendChild(el('th', 'corner'));
    w.heatmap.concerns.forEach(function (cn) { hr.appendChild(el('th', 'col-label', cn)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    var cellMap = {};
    w.heatmap.cells.forEach(function (cell) { cellMap[cell.place + '\\u0000' + cell.concern] = cell; });
    w.heatmap.places.forEach(function (place) {
      var row = el('tr');
      row.appendChild(el('th', 'row-label', place));
      w.heatmap.concerns.forEach(function (cn) {
        var cell = cellMap[place + '\\u0000' + cn];
        var td = el('td', 'heat-cell ' + verdictClass(cell.verdict));
        td.title = cell.title;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function renderList(id, items, fmt, emptyText) {
    var host = document.getElementById(id);
    host.textContent = '';
    if (!items.length) { host.appendChild(el('li', 'muted', emptyText)); return; }
    items.forEach(function (it) { host.appendChild(el('li', null, fmt(it))); });
  }

  // The exact same formatUsd implementation tested in report-web.test.ts, embedded verbatim \u2014 never a second,
  // hand-copied one that could drift from it.
  ${formatUsd.toString()}

  function renderStory() {
    var s = currentWindow().story;
    setText('story-runs', String(s.runs));
    setText('story-calls', String(s.paidCalls));
    setText('story-spend', formatUsd(s.spendUsd));
    setText('story-actors', s.actors.length ? s.actors.join(', ') : 'none');
    setText('story-range', (s.dateFrom ? s.dateFrom.slice(0, 10) : '\u2014') + ' \u2192 ' + (s.dateTo ? s.dateTo.slice(0, 10) : '\u2014'));
    setText('story-merged', String(s.pathsMerged));
    var arcText = function (f) { return f.place + ' \xB7 ' + f.concern + ' \xB7 ' + f.fromId + ' \u2192 ' + f.toId; };
    renderList('story-fixes', s.fixes, arcText, 'none yet');
    renderList('story-regressions', s.regressions, arcText, 'none');
    renderList('story-findings', s.findings, function (f) { return f.id + ' \xB7 ' + f.place + ' \xB7 ' + f.goal; }, 'none');
    setText('story-outcomes', 'held ' + s.outcomes.held + ' \xB7 overruled ' + s.outcomes.overruled + ' \xB7 failed ' + s.outcomes.failed + ' \xB7 open ' + s.outcomes.open);
  }

  function render() {
    renderConcerns();
    renderMap();
    renderHeat();
    renderStory();
    document.getElementById('tab-map').hidden = state.tab !== 'map';
    document.getElementById('tab-heat').hidden = state.tab !== 'heat';
    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === state.tab ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('.range-btn'), function (b) { b.setAttribute('aria-pressed', b.dataset.range === state.range ? 'true' : 'false'); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) {
    b.addEventListener('click', function () { state.tab = b.dataset.tab; render(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.range-btn'), function (b) {
    b.addEventListener('click', function () { state.range = b.dataset.range; render(); });
  });

  var themeBtn = document.getElementById('theme-btn');
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  var saved = null;
  try { saved = localStorage.getItem('mm3-viewer-theme'); } catch (e) { saved = null; }
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
  themeBtn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = current === 'dark' ? 'light' : current === 'light' ? null : (prefersDark ? 'light' : 'dark');
    applyTheme(next);
    try {
      if (next) localStorage.setItem('mm3-viewer-theme', next);
      else localStorage.removeItem('mm3-viewer-theme');
    } catch (e) { /* per-viewer convenience only; a blocked store just means the toggle doesn't persist */ }
  });

  render();
})();
`;
function renderViewerHtml(data) {
  const json = escapeForInlineJson(JSON.stringify(data));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MM3 ledger viewer</title>
<style>${CSS}</style>
</head>
<body>
${BODY2}
<script type="application/json" id="viewer-data">${json}</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}
function tryOpen(filePath, platform, runner, env) {
  if (platform === "linux" && !env.DISPLAY?.trim() && !env.WAYLAND_DISPLAY?.trim()) return false;
  const [cmd, args2] = platform === "darwin" ? ["open", [filePath]] : platform === "win32" ? ["cmd", ["/c", "start", "", filePath]] : ["xdg-open", [filePath]];
  try {
    return runner(cmd, args2).status === 0;
  } catch {
    return false;
  }
}
function runReportWeb(ctx) {
  const records = readLedger(ctx.paths, { partialTail: true });
  const data = buildViewerData(records, ctx.now ? ctx.now() : Date.now());
  const html = renderViewerHtml(data);
  ensureDir(ctx.paths);
  const viewerPath = path23.join(ctx.paths.dir, "viewer.html");
  writeFileSync9(viewerPath, html);
  const shown2 = path23.relative(ctx.paths.root, viewerPath).split(path23.sep).join("/");
  const opened = tryOpen(viewerPath, ctx.platform, ctx.runner, ctx.env);
  const runCount = data.windows.all.story.runs;
  const placeCount = data.windows.all.layers.reduce((n, l) => n + l.cards.length, 0);
  const summary = `mm3 report web \xB7 wrote ${shown2} (${runCount} run${runCount === 1 ? "" : "s"}, ${placeCount} place${placeCount === 1 ? "" : "s"})`;
  return { exit: 0, text: opened ? `${summary} \u2192 opened in your browser` : `${summary} \u2192 open it yourself, no browser available` };
}

// src/verbs/report.ts
var VIEWS = ["hits", "patterns", "history", "web", "graph", "problems", "mdl", "calls", "fields"];
var isView = (s) => VIEWS.includes(s);
var VIEW_LIST_TEXT = "hits, patterns, history, web, graph, problems, mdl, calls or fields";
var ROW_LIMIT = 30;
function withCap(lines, total) {
  const shown2 = lines.slice(0, ROW_LIMIT);
  return total > shown2.length ? [...shown2, `\u2026 ${total - shown2.length} more not shown`] : [...shown2];
}
var heading = (view, n, noun) => `mm3 report ${view} \xB7 ${n} ${noun}${n === 1 ? "" : "s"}`;
function isStale3(root, rec, categoryName) {
  const cat = rec.ask.categories.find((c) => c.name === categoryName);
  if (!cat || !cat.questions.length) return false;
  const [q] = subjectQuestions([cat]);
  const evidence = readCodeEvidence(root, rec.where);
  if (!evidence.ok) return true;
  const key2 = answerKey(subjectEvidence(evidence.evidence.files), q);
  return rec.keys[q.id] !== key2;
}
var GATE_RANK2 = { fail: 0, unsure: 1, pass: 2 };
function reportHits(paths) {
  const rows = withIndex(
    paths,
    (handle) => {
      const out = [];
      const places = handle.distinctPlaces().filter((p) => p.kind === "where");
      for (const { val: place } of places) {
        const newest = handle.placeCandidates(place).at(-1);
        if (!newest) continue;
        const rec = readRecordAt(paths.log, newest.offset);
        if (!rec || !isContractRun(rec)) continue;
        if (rec.items === null) {
          for (const [category, gate] of Object.entries(rec.categories)) {
            out.push({ place, category, gate, runId: rec.id, goal: rec.goal, rec });
          }
        } else {
          for (const item of Object.values(rec.items)) {
            if (item.unit?.path !== place) continue;
            for (const [category, gate] of Object.entries(item.categories)) out.push({ place, category, gate, runId: rec.id, goal: rec.goal });
          }
        }
      }
      return out;
    },
    { readOnly: true }
  );
  if (!rows.length) return { exit: 0, text: 'mm3 report hits \xB7 no runs yet \u2192 "mm3 class <request>" starts one' };
  rows.sort((a, b) => GATE_RANK2[a.gate] - GATE_RANK2[b.gate] || a.place.localeCompare(b.place) || a.category.localeCompare(b.category));
  const shown2 = rows.slice(0, ROW_LIMIT);
  const lines = shown2.map((r) => {
    const stale = r.rec ? isStale3(paths.root, r.rec, r.category) : false;
    return `${clip(r.place, 50)} \xB7 ${r.category} ${r.gate} \xB7 ${r.runId} "${clip(r.goal, 40)}"${stale ? " \xB7 stale" : ""}`;
  });
  return { exit: 0, text: [heading("hits", rows.length, "row"), ...withCap(lines, rows.length)].join("\n") };
}
function reportPatterns(paths) {
  const rows = withIndex(paths, (h) => h.patternCounts(), { readOnly: true });
  if (!rows.length) return { exit: 0, text: 'mm3 report patterns \xB7 no runs yet \u2192 "mm3 class <request>" starts one' };
  const lines = rows.map(
    (r) => `${r.pattern} \xB7 runs ${r.runs} \xB7 places ${r.places} \xB7 pass ${r.pass} fail ${r.fail} unsure ${r.unsure} \xB7 held ${r.outcomes.held} overruled ${r.outcomes.overruled} failed ${r.outcomes.failed} open ${r.outcomes.open}`
  );
  return { exit: 0, text: [heading("patterns", rows.length, "pattern"), ...withCap(lines, rows.length)].join("\n") };
}
function placesOf(rec) {
  if (!rec) return "(unknown place)";
  if (isRun(rec)) return rec.where.map((w) => w.path).join(", ") || "(no place)";
  if (!isContractRun(rec)) return "(unknown place)";
  const ws = rec.where.map(stripLines);
  if (ws.length) return ws.join(", ");
  const sweep = sweepPlaces(rec).filter((p) => p.kind === "where").map((p) => p.val);
  return sweep.length ? sweep.join(", ") : "(no place)";
}
function replayStatus(rec) {
  const graded = gradeReplay(rec.ask.categories, rec.answers);
  if (graded.regressed.length) return "regressed";
  return graded.categories.some((c) => c.before !== "pass" && c.after === "pass") ? "fixed" : void 0;
}
function reportHistory(paths) {
  const rows = withIndex(
    paths,
    (handle) => {
      const out = [];
      for (const { offset } of handle.recentReplays(ROW_LIMIT)) {
        const rec = readRecordAt(paths.log, offset);
        if (!rec || !isContractRun(rec)) continue;
        const status = replayStatus(rec);
        if (!status) continue;
        out.push({ ts: rec.ts, text: `${placesOf(rec)} \xB7 ${rec.id} replay \xB7 ${status}` });
      }
      for (const o of handle.recentOutcomes(ROW_LIMIT)) {
        const runOffset = handle.findOffset(o.runId);
        const rec = runOffset === void 0 ? void 0 : readRecordAt(paths.log, runOffset);
        out.push({ ts: o.ts, text: `${placesOf(rec)} \xB7 ${o.runId} \xB7 ${o.outcome} by ${o.by}` });
      }
      return out;
    },
    { readOnly: true }
  );
  if (!rows.length) return { exit: 0, text: 'mm3 report history \xB7 nothing yet \u2192 run "replay" or "outcome" to start one' };
  rows.sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
  return { exit: 0, text: [heading("history", rows.length, "event"), ...withCap(rows.map((r) => r.text), rows.length)].join("\n") };
}
function ensureHotIndexFresh(paths) {
  withIndex(paths, () => void 0);
}
function graphUnavailableText(view) {
  return `mm3 report ${view} \xB7 graph needs node:sqlite (Node \u2265 22.13) \u2192 see "mm3 doctor"`;
}
function withGraphView(paths, env, view, fn) {
  try {
    ensureHotIndexFresh(paths);
    refreshGraph(paths, env);
  } catch (e) {
    if (e instanceof GraphUnavailableError) return { exit: 0, text: graphUnavailableText(view) };
    throw e;
  }
  return fn();
}
function reportProblems(paths, env) {
  return withGraphView(paths, env, "problems", () => {
    const rows = problemCounts(paths, { limit: 500 });
    if (!rows.length) return { exit: 0, text: 'mm3 report problems \xB7 no runs yet \u2192 "mm3 class <request>" starts one' };
    const lines = rows.map((r) => `${r.family} \xD7 ${clip(r.place, 50)} \xB7 fail ${r.fail} unsure ${r.unsure} pass ${r.pass}`);
    return { exit: 0, text: [heading("problems", rows.length, "row"), ...withCap(lines, rows.length)].join("\n") };
  });
}
function reportMdl(paths, env) {
  return withGraphView(paths, env, "mdl", () => {
    const rows = mdlRows(paths, { limit: 1e3 });
    if (!rows.length) return { exit: 0, text: 'mm3 report mdl \xB7 no runs yet \u2192 "mm3 class <request>" starts one' };
    const lines = rows.map(
      (r) => `${r.id} ${r.verb} \xB7 why:${r.why ?? "\u2014"} area:${r.area ?? "\u2014"} stage:${r.stage ?? "\u2014"} change:${r.change ?? "\u2014"} risk:${r.risk ?? "\u2014"} blast:${r.blast ?? "\u2014"}` + (r.problem ? ` \xB7 ${clip(r.problem, 60)}` : "")
    );
    return { exit: 0, text: [heading("mdl", rows.length, "run"), ...withCap(lines, rows.length)].join("\n") };
  });
}
function reportCalls(paths, env) {
  return withGraphView(paths, env, "calls", () => {
    const rows = callStats(paths, {});
    if (!rows.length) return { exit: 0, text: 'mm3 report calls \xB7 no calls in the last 30 days \u2192 "mm3 class <request>" starts one' };
    rows.sort((a, b) => b.day.localeCompare(a.day) || a.verb.localeCompare(b.verb) || a.model.localeCompare(b.model) || a.source.localeCompare(b.source));
    const lines = rows.map((r) => `${r.day} \xB7 ${r.verb} \xB7 ${r.model} (${r.source}) \xB7 calls ${r.calls} \xB7 tokens ${r.tokens} \xB7 cost $${r.costUsd.toFixed(4)} \xB7 saved $${r.savedUsd.toFixed(4)}`);
    return { exit: 0, text: [heading("calls", rows.length, "row"), ...withCap(lines, rows.length)].join("\n") };
  });
}
function gateWord(score) {
  if (score === 0) return "fail";
  if (score === 0.5) return "unsure";
  if (score === 1) return "pass";
  return void 0;
}
function groupEdges(edges) {
  const byKey = /* @__PURE__ */ new Map();
  for (const e of edges) {
    const key2 = `${e.p}\0${e.s}\0${e.o}\0${e.score ?? ""}\0${e.provenance}`;
    let g = byKey.get(key2);
    if (!g) {
      g = { p: e.p, s: e.s, o: e.o, score: e.score, provenance: e.provenance, runs: [] };
      byKey.set(key2, g);
    }
    if (!g.runs.includes(e.run)) g.runs.push(e.run);
  }
  return [...byKey.values()];
}
function runsLabel(runs) {
  const sorted = [...runs].sort();
  return sorted.length <= 3 ? sorted.join(", ") : `${sorted[0]}..${sorted[sorted.length - 1]}`;
}
function renderEdge(byId2, g) {
  const sLabel = byId2.get(g.s) ?? String(g.s);
  const oLabel = byId2.get(g.o) ?? String(g.o);
  const word = gateWord(g.score);
  const count = g.runs.length;
  const pred = word !== void 0 ? count > 1 ? `${g.p} ${word} (p ${g.score}, \xD7${count})` : `${g.p} ${word} (p ${g.score})` : count > 1 ? `${g.p} (\xD7${count})` : g.p;
  return `${sLabel} --${pred}--> ${oLabel} (${g.provenance}) [${runsLabel(g.runs)}]`;
}
function reportGraph(paths, env, target) {
  return withGraphView(paths, env, "graph", () => {
    const t = target?.trim();
    if (!t) return { exit: 0, text: "mm3 report graph \xB7 name a target \u2192 mm3 report graph <kind>:<label> (e.g. category:injection)" };
    const colon = t.indexOf(":");
    if (colon <= 0 || colon === t.length - 1) {
      return { exit: 2, text: stopText([`\u2716 report graph: "${clip(t, 40)}" is not kind:label \u2192 e.g. category:injection`], "report") };
    }
    const kind = t.slice(0, colon);
    const label = t.slice(colon + 1);
    const { nodes, edges } = graphAround(paths, { kind, label, depth: 2 });
    if (!nodes.length) return { exit: 0, text: `mm3 report graph ${t} \xB7 not found \u2192 run "mm3 class <request>" first, or check the kind:label spelling` };
    const byId2 = new Map(nodes.map((n) => [n.id, `${n.kind}:${n.label}`]));
    const groups = groupEdges(edges);
    const lines = groups.map((g) => renderEdge(byId2, g));
    const headingLine = `mm3 report graph ${t} \xB7 ${groups.length} edge${groups.length === 1 ? "" : "s"} (depth 2, ${nodes.length} node${nodes.length === 1 ? "" : "s"})`;
    return { exit: 0, text: [headingLine, ...withCap(lines, groups.length)].join("\n") };
  });
}
var CLOSED_MAX_DISTINCT = 8;
var CLOSED_MIN_RUNS = 5;
var PATTERN_CANDIDATES = [
  /^\d+$/u,
  // numeric — most specific
  /^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/u,
  // semver-ish
  /^[\w.-]+$/u
  // identifier-like — broadest, tried last
];
var isPathLike = (v) => v.includes("/") && /\.[A-Za-z0-9]{1,8}$/u.test(v);
function classifyField(count, values) {
  if (!values.length) return void 0;
  if (values.length <= CLOSED_MAX_DISTINCT && count >= CLOSED_MIN_RUNS) return { kind: "closed", values: [...values] };
  for (const re of PATTERN_CANDIDATES) {
    if (values.every((v) => re.test(v))) return { kind: "pattern", pattern: re.source };
  }
  if (values.every(isPathLike)) return { kind: "reference" };
  return void 0;
}
function suggestionText(s) {
  if (!s) return "no suggestion yet \u2014 not enough signal";
  if (s.kind === "closed") return `closed [${s.values.join(", ")}]`;
  if (s.kind === "pattern") return `pattern: ${s.pattern}`;
  return "reference (link: where)";
}
function reportFields(paths, env, accept, resolved) {
  ensureHotIndexFresh(paths);
  const { config } = configOf({ paths, env, config: resolved });
  const knownKeys = [...MDL_KEYS, ...Object.keys(config.mdl)];
  const fields = undeclaredFieldSamples(paths, { knownKeys });
  if (accept !== void 0) {
    const field = fields.find((f) => f.key === accept);
    if (!field) {
      return { exit: 2, text: stopText([`\u2716 report fields --accept: "${clip(accept, 40)}" is not an undeclared field \u2192 run "mm3 report fields" to see what's available`], "report") };
    }
    const suggestion = classifyField(field.count, field.values);
    if (!suggestion) {
      return { exit: 2, text: stopText([`\u2716 report fields --accept: "${clip(accept, 40)}" has no suggestion yet \u2192 not enough signal, keep collecting runs`], "report") };
    }
    const patch = suggestion.kind === "closed" ? { mdl: { [accept]: { values: suggestion.values } } } : suggestion.kind === "pattern" ? { mdl: { [accept]: { pattern: suggestion.pattern } } } : { mdl: { [accept]: { link: "where" } } };
    writeConfigOverride(paths, patch);
    const shown2 = suggestion.kind === "closed" ? `values: [${suggestion.values.join(", ")}]` : suggestion.kind === "pattern" ? `pattern: ${suggestion.pattern}` : "link: where";
    return { exit: 0, text: `mm3 report fields --accept ${accept} \xB7 wrote mdl.${accept} (${shown2}) to .mm3/config.yaml` };
  }
  if (!fields.length) return { exit: 0, text: "mm3 report fields \xB7 no undeclared fields yet \u2192 every mdl key so far is a base field or already configured" };
  const lines = fields.map((f) => `${f.key} (${f.count} run${f.count === 1 ? "" : "s"}) \xB7 samples: ${f.samples.join(", ") || "(no values)"} \xB7 suggest: ${suggestionText(classifyField(f.count, f.values))}`);
  return { exit: 0, text: [heading("fields", fields.length, "field"), ...withCap(lines, fields.length)].join("\n") };
}
function runReport(view, ctx, target, accept) {
  const requested = view?.trim() || "hits";
  if (hasControlChars(requested)) return { exit: 2, text: stopText([`\u2716 report: the view name has control characters \u2192 use ${VIEW_LIST_TEXT}`], "report") };
  if (!isView(requested)) return { exit: 2, text: stopText([`\u2716 report: "${clip(requested, 40)}" is not a view \u2192 use ${VIEW_LIST_TEXT}`], "report") };
  const env = ctx.env ?? process.env;
  if (requested === "hits") return reportHits(ctx.paths);
  if (requested === "patterns") return reportPatterns(ctx.paths);
  if (requested === "history") return reportHistory(ctx.paths);
  if (requested === "graph") return reportGraph(ctx.paths, env, target);
  if (requested === "problems") return reportProblems(ctx.paths, env);
  if (requested === "mdl") return reportMdl(ctx.paths, env);
  if (requested === "calls") return reportCalls(ctx.paths, env);
  if (requested === "fields") return reportFields(ctx.paths, env, accept, ctx.config);
  return runReportWeb({ paths: ctx.paths, env, runner: ctx.runner ?? realRunner, platform: ctx.platform ?? process.platform });
}

// src/verbs/scan.ts
var ENTRYPOINT_GLOBS = ["server.js", "app.js", "index.js", "main.js", "config/**"];
var MISSED_SHOWN = 3;
var WHERE_CAP3 = 50;
function whereFromItems3(items) {
  return [...new Set(items.flatMap((i) => i.unit ? [i.unit.path] : []))].sort().slice(0, WHERE_CAP3);
}
function unlookedEntrypoints(root, items, maxFiles) {
  const touched = new Set(items.flatMap((i) => i.unit ? [i.unit.path] : []));
  const missed = [...new Set(ENTRYPOINT_GLOBS.flatMap((pattern) => expandGlob(root, pattern, maxFiles).files))].filter((f) => !touched.has(f));
  if (!missed.length) return void 0;
  const shown2 = missed.slice(0, MISSED_SHOWN);
  const named = missed.length > shown2.length ? `${shown2.join(", ")}, \u2026 ${missed.length - shown2.length} more` : shown2.join(", ");
  return `entrypoints/config outside over: ${named} \u2014 add them to over: file if they matter here`;
}
async function runScan(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "scan", mdlFields, contractLimits(cfg, "scan"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const notes = [];
  const who = { adapter: ctx.provider.adapter, model: ctx.provider.model };
  const identity = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
  const plan = planSweep(request, who, ctx.paths, ctx.dryRun ?? false, { resolve: createCodeResolver(ctx.paths.root, notes, cfg.evidence.maxFiles) }, { sweep: cfg.sweep, reuse: cfg.reuse, evidence: cfg.evidence });
  if (ctx.dryRun) return sweepDryRun(plan, identity, probeWarnings(request.mak));
  const entrypointNote = unlookedEntrypoints(ctx.paths.root, plan.items, cfg.evidence.maxFiles);
  if (entrypointNote) notes.push(entrypointNote);
  const pre = preflight(ctx, { needsBudget: planNeedsBudget(plan) });
  if (!pre.ok) return pre.result;
  const swept = await runSweep(ctx, "scan", plan);
  if (!swept.ok) return swept.result;
  const { answers, costUsd, costEstimated, telemetry, statusOf } = swept.value;
  const categoriesOf = (layer) => request.mak.layers.find((l) => l.name === layer)?.categories ?? [];
  const grades = gradeItems(plan.items, categoriesOf, statusOf, answers);
  const goalAnswer = answers["goal"];
  const goalGrade = goalGate(goalAnswer.p);
  const gate = sweepGate(goalGrade, grades);
  const graded = [...grades.values()].filter((g) => g.status === "asked" || g.status === "reused");
  const worst = worstFirst(grades.values());
  const failing = m(...worst.map((g) => sweepEntry(g)));
  const passing = graded.filter((g) => g.ownGate === "pass").length;
  const reused = graded.filter((g) => g.status === "reused").length;
  const scanned = m(...plan.layers.map((l) => [l, plan.items.filter((i) => i.layer === l).length]));
  const calls = plannedCallCount(plan);
  const items = itemRecords(plan.items, grades);
  const reusedFromObj = Object.fromEntries(plan.reusedFrom);
  const reusedAges = reusedAgeNotes(ctx.paths, reusedIds(reusedFromObj));
  const fullTelemetry = [...telemetry, ...cacheTelemetry(ctx.paths, reusedFromObj)];
  const response = (id, budget) => respondText(
    m(
      ["id", id],
      ["gate", gate],
      ["goal", m(["gate", goalGrade], ["p", goalAnswer.p])],
      ["scanned", scanned],
      ["failing", failing],
      ["passing", passing],
      ["reused", reused]
    ),
    mdlRecorded(request.mdl),
    sweepNext(id, gate, worst, graded, "act on it"),
    commonNotes(
      [...loaded.notes, ...notes, ...plan.splitNotes, ...reusedAges, ...pre.value.created ? [createdNote(pre.value.state)] : [], ...costEstimated ? [COST_ESTIMATED_NOTE] : []],
      `${calls} call${calls === 1 ? "" : "s"} \xB7 ${plan.askedQuestions} question${plan.askedQuestions === 1 ? "" : "s"} \xB7 ${budget}`,
      ctx.provider.adapter,
      ctx.paths,
      ctx.notes
    )
  );
  const where = whereFromItems3(plan.items);
  const run = {
    verb: "scan",
    actor: actorOf(ctx),
    task: ctx.env.MM3_TASK?.trim() || null,
    goal: request.mak.goal,
    depth: request.mak.depth ?? null,
    where,
    parent: request.mak.parent ?? request.mdl?.parent ?? null,
    from: null,
    compare: null,
    commit: currentCommitSha(ctx.paths.root, where),
    mdl: request.mdl,
    ask: { categories: [], layers: request.mak.layers },
    over: request.mak.over,
    items,
    answers,
    keys: Object.fromEntries(plan.keys),
    reusedFrom: Object.fromEntries(plan.reusedFrom),
    categories: {},
    gate,
    goalGate: goalGrade,
    goalP: goalAnswer.p,
    consensus: null,
    response,
    notes: [],
    adapter: ctx.provider.adapter,
    model: ctx.provider.model,
    costUsd: costUsd ?? null,
    calls,
    route: identity.route,
    baseURL: identity.baseURL,
    telemetry: fullTelemetry
  };
  return recordSweep(ctx, calls, costUsd, run);
}

// src/verbs/template.ts
var import_yaml5 = __toESM(require_dist(), 1);
import { readFileSync as readFileSync23 } from "node:fs";
import path24 from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_PACKAGE_DIR = path24.join(path24.dirname(fileURLToPath(import.meta.url)), "..", "..");
function drillSampleFile(parent, paths) {
  const run = paths && findRun(paths, parent);
  if (run && isContractRun(run) && run.items === null) return "drill-subject.yaml";
  return "drill.yaml";
}
function questionToWire(q) {
  if (q.kind === "yesno") return q.text;
  if (q.kind === "scale") return { scale: q.text, levels: q.levels };
  return { choice: q.text, options: q.options };
}
function categoryToWire(c) {
  const out = { pass: c.pass };
  if (c.need !== "all") out.need = c.need;
  if (c.tags.length) out.tags = c.tags;
  if (c.familySource === "given") out.family = c.family;
  for (const q of c.questions) out[String(q.n)] = questionToWire(q);
  return out;
}
function sectionsToWire(categories) {
  const out = {};
  const concerns = categories.filter((c) => c.section === "concerns");
  const decisions = categories.filter((c) => c.section === "decisions");
  if (concerns.length) out.concerns = Object.fromEntries(concerns.map((c) => [c.name, categoryToWire(c)]));
  if (decisions.length) out.decisions = Object.fromEntries(decisions.map((c) => [c.name, categoryToWire(c)]));
  return out;
}
function askToWire(run) {
  if (run.ask.layers.length) {
    const out = {};
    for (const layer of run.ask.layers) out[layer.name] = sectionsToWire(layer.categories);
    return out;
  }
  return sectionsToWire(run.ask.categories);
}
function fromRunId(id, flags, paths) {
  if (!paths) return { exit: 2, text: stopText([`\u2716 template: --from "${id}" needs a project to look up the ledger \u2192 run inside one, or point --from at a request file`], "template") };
  const run = findRun(paths, id);
  if (!run) return { exit: 2, text: stopText([`\u2716 template: --from "${id}" is not in the ledger \u2192 check the id, or point --from at a request file`], "template") };
  if (!isContractRun(run)) return { exit: 2, text: stopText([`\u2716 template: --from "${id}" predates the YAML contract \u2192 point --from at a request file instead`], "template") };
  const replayExpect = run.expect;
  const echoesWhere = run.verb !== "scan" && run.verb !== "drill";
  const mak = run.verb === "replay" ? { verb: run.verb, goal: run.goal, parent: run.parent, compare: run.compare, ...replayExpect ? { expect: replayExpect } : {} } : {
    verb: run.verb,
    goal: run.goal,
    ...run.depth ? { depth: run.depth } : {},
    ...echoesWhere && run.where.length ? { where: run.where } : {},
    ...run.parent ? { parent: run.parent } : {},
    ...run.from ? { from: run.from } : {},
    ...run.compare ? { compare: run.compare } : {},
    ...run.over ? { over: run.over } : {},
    ask: askToWire(run)
  };
  const doc = (0, import_yaml5.parseDocument)((0, import_yaml5.stringify)({ mak, ...run.mdl ? { mdl: run.mdl } : {} }));
  if (flags.goal !== void 0) doc.setIn(["mak", "goal"], flags.goal);
  if (flags.where !== void 0) doc.setIn(["mak", "where"], flags.where);
  return { exit: 0, text: doc.toString() };
}
var invalidYaml = (from, exit = 2) => ({ exit, text: stopText([`\u2716 template: --from "${clip(from, 60)}" is not valid YAML \u2192 fix it (YAML indents with spaces, never tabs), or point at an MM3 request file`], "template") });
function fromFile(from, flags) {
  let raw;
  try {
    raw = readFileSync23(from, "utf8");
  } catch (e) {
    const code = e.code;
    const shown2 = clip(from, 60);
    return { exit: 2, text: stopText([`\u2716 template: --from "${shown2}" ${code === "ENOENT" ? "not found" : "cannot be read"} \u2192 check the path`], "template") };
  }
  let doc;
  try {
    doc = (0, import_yaml5.parseDocument)(raw);
  } catch {
    return invalidYaml(from);
  }
  if (!doc.has("mak")) return { exit: 2, text: stopText([`\u2716 template: --from "${clip(from, 60)}" has no mak: block \u2192 point at an MM3 request file`], "template") };
  if (flags.goal !== void 0) doc.setIn(["mak", "goal"], flags.goal);
  if (flags.where !== void 0) doc.setIn(["mak", "where"], flags.where);
  try {
    return { exit: 0, text: doc.toString() };
  } catch {
    return invalidYaml(from, 1);
  }
}
function runTemplate(target, flags = {}, paths, packageDir = DEFAULT_PACKAGE_DIR) {
  if (!VERBS.includes(target)) return { exit: 2, text: stopText([`\u2716 template: "${clip(target, 30)}" is not a verb \u2192 one of ${VERBS.join(", ")}`], "template") };
  if (flags.parent !== void 0) {
    if (target !== "drill") return { exit: 2, text: stopText([`\u2716 template: --parent only applies to drill \u2192 mm3 template ${target}`], "template") };
    if (flags.from === void 0) {
      return {
        exit: 2,
        text: stopText(["\u2716 template drill: needs both --parent and --from, or neither \u2192 mm3 template drill --parent MM3-#### --from <item or category>"], "template")
      };
    }
    if (flags.where !== void 0 || flags.goal !== void 0) {
      return {
        exit: 2,
        text: stopText(["\u2716 template: --where/--goal don't apply with --parent \u2192 they overlay a checklist read from --from <request.yaml> instead"], "template")
      };
    }
    const file = drillSampleFile(flags.parent, paths);
    const raw = readPackageFile(packageDir, "skills", "mm3", "templates", file);
    const doc = (0, import_yaml5.parseDocument)(raw);
    doc.setIn(["mak", "parent"], flags.parent);
    doc.setIn(["mak", "from"], flags.from);
    return { exit: 0, text: doc.toString() };
  }
  if (flags.from !== void 0) return RUN_ID.test(flags.from) ? fromRunId(flags.from, flags, paths) : fromFile(flags.from, flags);
  if (flags.where !== void 0 || flags.goal !== void 0) {
    return { exit: 2, text: stopText([`\u2716 template: --where/--goal need --from \u2192 mm3 template ${target} --from <request.yaml>`], "template") };
  }
  return { exit: 0, text: readPackageFile(packageDir, "skills", "mm3", "templates", `${target}.yaml`) };
}

// src/verbs/view.ts
import path25 from "node:path";
var REQUEST_MODE = /^mak\s*:/mu;
function runLine(r, outcome) {
  const rehearsal = isRehearsal(r.adapter) ? " \xB7 rehearsal" : "";
  const line3 = isRun(r) ? `${r.id} ${r.ts.slice(0, 10)} ${r.verb} L${r.level} ${r.consensus} ${r.verdict} "${clip(r.focus, 48)}" \xB7 ${outcome}` : `${r.id} ${r.ts.slice(0, 10)} ${r.verb} ${r.depth ?? "-"} ${r.gate} "${clip(r.goal, 48)}" \xB7 ${outcome}`;
  return `${clip(line3, 120 - rehearsal.length)}${rehearsal}`;
}
var tagsMatch = (r, place) => {
  if (isRun(r)) return r.tags.includes(place);
  return isContractRun(r) && r.ask.layers.some((l) => l.categories.some((c) => c.tags.includes(place)));
};
var pathMatches = (p, place) => p === place || p.startsWith(`${place}/`);
function whereMatches(r, place) {
  if (isRun(r)) return r.where.some((w) => pathMatches(w.path, place));
  if (r.where.some((w) => pathMatches(stripLines(w), place))) return true;
  return isContractRun(r) && !!r.items && Object.values(r.items).some((it) => !!it.unit && pathMatches(it.unit.path, place));
}
function toPlace(target, root) {
  if (hasControlChars(target)) return { stop: stopText(["\u2716 view: the target has control characters \u2192 use a folder, a tag, or MM3-####"], "view") };
  if (!path25.isAbsolute(target) && !target.split(/[\\/]/).includes("..")) return { place: target.replace(/^\.\//, "").replace(/\/+$/, "") || "." };
  const rel = path25.relative(root, path25.resolve(root, target));
  if (rel.startsWith("..") || path25.isAbsolute(rel)) {
    return { stop: stopText([`\u2716 view: "${clip(target, 60)}" is outside the project \u2192 use a folder inside it, a tag, or MM3-####`], "view") };
  }
  return { place: rel.split(path25.sep).join("/") || "." };
}
function renderPlace(place, hits, outcomeOf, limit) {
  if (!hits.length) return { exit: 0, text: `mm3 view ${clip(place, 60)} \xB7 no runs yet \u2192 "mm3 class <request>" starts one` };
  const counts = { held: 0, overruled: 0, failed: 0, open: 0 };
  let rehearsal = 0;
  for (const r of hits) {
    if (isRehearsal(r.adapter)) rehearsal += 1;
    else counts[outcomeOf(r.id) ?? "open"] += 1;
  }
  const head = `mm3 view ${clip(place, 60)} \xB7 ${hits.length} run${hits.length === 1 ? "" : "s"} \xB7 held ${counts.held} \xB7 overruled ${counts.overruled} \xB7 failed ${counts.failed} \xB7 open ${counts.open}${rehearsal ? ` \xB7 rehearsal ${rehearsal}` : ""}`;
  const shown2 = hits.slice(-limit).reverse();
  const older = hits.length - shown2.length;
  return {
    exit: 0,
    text: [head, ...shown2.map((r) => runLine(r, outcomeOf(r.id) ?? "open")), ...older ? [`\u2026 ${older} older \u2192 raise the level to see more`] : []].join("\n")
  };
}
var GATE_RANK3 = { fail: 0, unsure: 1, pass: 2 };
function renderSummary(scope, hits) {
  const latest = /* @__PURE__ */ new Map();
  for (const r of hits) {
    if (!isContractRun(r)) continue;
    for (const w of r.where.map(stripLines)) latest.set(w, r);
    for (const p of sweepPlaces(r)) if (p.kind === "where") latest.set(p.val, r);
  }
  if (!latest.size) return { exit: 0, text: `mm3 view ${clip(scope, 60)} --summary \xB7 no runs yet \u2192 "mm3 class <request>" starts one` };
  const rows = [...latest.entries()].sort(([pa, ra], [pb, rb]) => GATE_RANK3[ra.gate] - GATE_RANK3[rb.gate] || pa.localeCompare(pb));
  return {
    exit: 0,
    text: [
      `mm3 view ${clip(scope, 60)} --summary \xB7 ${rows.length} place${rows.length === 1 ? "" : "s"}`,
      ...rows.map(([place, r]) => `${clip(place, 60)} \xB7 ${r.verb} ${r.gate} \xB7 ${r.id} "${clip(r.goal, 48)}"`)
    ].join("\n")
  };
}
function byPlaceFullScan(place, paths, limit, summary) {
  const records = readLedger(paths, { partialTail: true });
  const runs = records.filter((r) => isRun(r) || isContractRun(r));
  const hits = runs.filter((r) => place === "." || tagsMatch(r, place) || whereMatches(r, place));
  if (summary) return renderSummary(place, hits);
  return renderPlace(place, hits, (id) => latestOutcome(records, id) ?? void 0, limit);
}
function byPlaceIndexed(place, paths, limit, summary) {
  return withIndex(
    paths,
    (handle) => {
      const hits = [];
      for (const { offset } of handle.placeCandidates(place)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && (isRun(rec) || isContractRun(rec)) && (tagsMatch(rec, place) || whereMatches(rec, place))) hits.push(rec);
      }
      if (summary) return renderSummary(place, hits);
      const outcomes = handle.outcomesFor(hits.map((r) => r.id));
      return renderPlace(place, hits, (id) => outcomes.get(id), limit);
    },
    { readOnly: true }
  );
}
function byPlace(place, paths, limit, summary) {
  const result = place === "." ? byPlaceFullScan(place, paths, limit, summary) : byPlaceIndexed(place, paths, limit, summary);
  appendLookup(paths, { goal: place, where: [place], hit: false, reused: null });
  return result;
}
function runAt(paths, handle, id) {
  const offset = handle.findOffset(id);
  if (offset === void 0) return void 0;
  const rec = readRecordAt(paths.log, offset);
  return rec && (isRun(rec) || isContractRun(rec)) && rec.id === id ? rec : void 0;
}
function childrenAt(paths, handle, parentId) {
  const out = [];
  for (const { offset } of handle.childrenOf(parentId)) {
    const rec = readRecordAt(paths.log, offset);
    if (rec && (isRun(rec) || isContractRun(rec)) && rec.parent === parentId) out.push(rec);
  }
  return out;
}
function detailLines(self, level) {
  if (level < 2 || !isContractRun(self)) return [];
  const lines = [];
  const cats = Object.entries(self.categories);
  if (cats.length) lines.push(`  categories: ${cats.map(([n, g]) => `${n}=${g}`).join(", ")}`);
  else if (self.items) {
    const items = Object.values(self.items);
    const failing = items.filter((it) => it.gate !== "pass").length;
    lines.push(`  items: ${items.length} (${failing} failing)`);
  }
  if (level >= 3) {
    if (self.notes.length) lines.push(`  notes: ${self.notes.join("; ")}`);
    lines.push(`  adapter: ${self.adapter} \xB7 model: ${self.model}`);
  }
  return lines;
}
function formatAnswer(a) {
  if (a.kind === "yesno") return `p ${a.p}`;
  const [level, p] = Object.entries(a.dist).reduce((best, e) => e[1] > best[1] ? e : best);
  return `${level} ${p}`;
}
function answerLine(r) {
  const reused = r.reusedFrom ? ` \xB7 reused ${r.reusedFrom}` : "";
  const key2 = r.key ? ` \xB7 key ${r.key}` : "";
  return `${r.id} "${clip(r.text, 60)}" \xB7 ${formatAnswer(r.answer)}${reused}${key2}`;
}
function questionRows(self) {
  const rows = [];
  const add = (id, text) => {
    const answer = self.answers[id];
    if (answer) rows.push({ id, text, answer, reusedFrom: self.reusedFrom[id], key: self.keys[id] });
  };
  if (self.items) {
    for (const [itemId, item] of Object.entries(self.items)) {
      const cats = self.ask.layers.find((l) => l.name === item.layer)?.categories ?? [];
      for (const q of [...cats.flatMap((c) => c.questions)].sort((a, b) => a.n - b.n)) add(`${itemId}#${q.n}`, fillBlanks(q.text, item.fill));
    }
  } else if (self.verb === "replay") {
    for (const q of subjectQuestions(self.ask.categories, "before:")) add(q.id, q.text);
    add("goal", self.goal);
    for (const q of subjectQuestions(self.ask.categories, "after:")) add(q.id, q.text);
  } else {
    add("goal", self.goal);
    for (const q of subjectQuestions(self.ask.categories)) add(q.id, q.text);
  }
  return rows;
}
function answersLines(self) {
  if (!isContractRun(self)) return [];
  const rows = questionRows(self);
  if (!rows.length) return ["  answers: none recorded"];
  return [`  answers ${rows.length}:`, ...rows.map((r) => `    ${answerLine(r)}`)];
}
function byId(id, paths, level, limit, answers) {
  const result = withIndex(
    paths,
    (handle) => {
      const self = runAt(paths, handle, id);
      if (!self) return { exit: 2, text: stopText([`\u2716 view: ${id} is not in the ledger \u2192 "mm3 view <folder>" lists recent runs`], "view") };
      const up = [];
      let cursor = self.parent ? runAt(paths, handle, self.parent) : void 0;
      while (cursor && up.length < limit) {
        up.unshift(cursor);
        cursor = cursor.parent ? runAt(paths, handle, cursor.parent) : void 0;
      }
      const down = [];
      const queue = [id];
      while (queue.length && down.length < limit) {
        const parent = queue.shift();
        for (const r of childrenAt(paths, handle, parent)) {
          if (down.length >= limit) break;
          down.push(r);
          queue.push(r.id);
        }
      }
      const outcomes = handle.outcomesFor([...up, self, ...down].map((r) => r.id));
      const outcomeOf = (r) => outcomes.get(r.id) ?? "open";
      return {
        exit: 0,
        text: [
          `mm3 view ${id} \xB7 lineage ${up.length} up \xB7 ${down.length} down`,
          ...up.map((r) => `\u2191 ${runLine(r, outcomeOf(r))}`),
          `\u25B6 ${runLine(self, outcomeOf(self))}`,
          ...detailLines(self, level),
          ...answers ? answersLines(self) : [],
          ...down.map((r) => `\u2193 ${runLine(r, outcomeOf(r))}`)
        ].join("\n")
      };
    },
    { readOnly: true }
  );
  if (result.exit === 0) appendLookup(paths, { goal: id, where: [], hit: false, reused: null });
  return result;
}
function categoryEntry2(name, runsHere) {
  let runs = 0;
  let pass = 0;
  let fail2 = 0;
  let last;
  for (const r of runsHere) {
    const gate = r.categories[name];
    if (gate === void 0) continue;
    runs += 1;
    if (gate === "pass") pass += 1;
    else if (gate === "fail") fail2 += 1;
    last = r.id;
  }
  return [name, runs ? m(["runs", runs], ["pass", pass], ["fail", fail2], ["last", last]) : m(["runs", 0])];
}
function runsForPlaces(paths, places) {
  return withIndex(
    paths,
    (handle) => {
      const offsets = /* @__PURE__ */ new Set();
      for (const place of places) for (const c of handle.placeCandidates(place)) offsets.add(c.offset);
      const hits = [];
      for (const offset of [...offsets].sort((a, b) => a - b)) {
        const rec = readRecordAt(paths.log, offset);
        if (rec && isContractRun(rec) && places.some((place) => whereMatches(rec, place))) hits.push(rec);
      }
      return hits;
    },
    { readOnly: true }
  );
}
function runRequestMode(text, ctx) {
  const cfg = configOf(ctx).config;
  const mdlFields = effectiveMdlFields(cfg.mdl);
  const loaded = loadRequest(text, "view", mdlFields, contractLimits(cfg, "view"));
  if (!loaded.ok) return loaded.result;
  const { request } = loaded;
  const evidence = readCodeEvidence(ctx.paths.root, request.mak.where, { limits: { perFileChars: cfg.evidence.perItemChars, totalChars: cfg.evidence.totalChars } });
  if (!evidence.ok) return { exit: 2, text: stopText(evidence.errors, "view") };
  const places = request.mak.where.map(stripLines);
  const runsHere = runsForPlaces(ctx.paths, places);
  const categoryNames = request.mak.categories.length ? request.mak.categories.map((c) => c.name) : [...new Set(runsHere.flatMap((r) => Object.keys(r.categories)))];
  let reuse2;
  let reuseMiss;
  if (request.mak.categories.length > 0) {
    const questions = [goalQuestion(request.mak.goal), ...subjectQuestions(request.mak.categories)];
    const evidenceStr = subjectEvidence(evidence.evidence.files);
    const keys = questions.map((q) => answerKey(evidenceStr, q));
    const who = providerIdentity(ctx.env, { resolveStored: ctx.resolveStored });
    const reuseLimits = cfg.reuse;
    reuse2 = exactReuse(ctx.paths, who, keys, { reuse: reuseLimits });
    if (reuse2 === void 0) reuseMiss = runsHere.length ? `code in where changed since ${runsHere.at(-1).id}` : "never asked";
    appendLookup(ctx.paths, { goal: request.mak.goal, where: request.mak.where, hit: reuse2 !== void 0, reused: reuse2 ?? null });
  }
  const reuseRun = reuse2 ? findRun(ctx.paths, reuse2) : void 0;
  const age = reuseRun && isContractRun(reuseRun) ? reuseAge(ctx.paths, { ts: reuseRun.ts, commit: reuseRun.commit ?? null, where: reuseRun.where }) : void 0;
  const next = reuse2 ? `mm3 view ${reuse2}` : "mm3 class";
  const mak = m(
    ["view", request.mak.where.join(", ")],
    ...reuse2 ? [["reuse", reuse2]] : reuseMiss ? [["reuse", reuseMiss]] : [],
    ...age ? [["reuseAge", m(["days", age.ageDays], ...age.commitsSince !== null ? [["commits", age.commitsSince]] : [])]] : [],
    ["runs", runsHere.length],
    ["categories", m(...categoryNames.map((name) => categoryEntry2(name, runsHere)))]
  );
  return { exit: 0, text: respondText(mak, mdlRecorded(null), next, ["free"]) };
}
function runView(arg, level, ctx, content, summary = false, answers = false) {
  const probe2 = (content ?? arg).trim();
  if (REQUEST_MODE.test(probe2) || probe2.startsWith("{")) return runRequestMode(content ?? arg, ctx);
  const at = RUN_ID.test(arg) ? void 0 : toPlace(arg, ctx.paths.root);
  if (at && "stop" in at) return { exit: 2, text: at.stop };
  const limit = level * 10;
  return at ? byPlace(at.place, ctx.paths, limit, summary) : byId(arg, ctx.paths, level, limit, answers);
}

// src/help/card.ts
var PITCH_LINE_1 = "MM3 turns a short numbered yes/no checklist into a calibrated pass/fail/unsure verdict \u2014 evidence,";
var PITCH_LINE_2 = "never a command. Think of it as a citable second opinion, not a linter.";
var PITCH_LINE_3 = "MM3 = MAK\xB3 (make: use what is proven) + MDL\xB3 (model: learn what is missing), each across Know / Judge / Prove.";
var PITCH = `${PITCH_LINE_1} ${PITCH_LINE_2} ${PITCH_LINE_3}`;
function card() {
  return [
    PITCH_LINE_1,
    PITCH_LINE_2,
    PITCH_LINE_3,
    "",
    "## Invoke it",
    'In Claude Code: call the `mm3` MCP tool directly \u2014 same args as the CLI (e.g. args: ["class", "-"]),',
    "the request YAML as stdin \u2014 no PATH lookup needed. Elsewhere: use `mm3` if it's",
    "on PATH, else `npx --no-install mm3`; if neither works, tell the user to run",
    '"npx @mvpscale/mm3 init" and stop.',
    "",
    "## Pick your verb",
    "| Grid | Know | Judge | Prove |",
    "|---|---|---|---|",
    "| MAK\xB3 \u2014 make: use what's proven     | view (free) | class (1 call) | replay (up to 2 calls) |",
    "| MDL\xB3 \u2014 model: learn what's missing | scan (1 call) | drill (1 call) | loop (1 call/layer) |",
    "",
    ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`),
    "",
    "## The contract (memorize \u2014 these cause most first-try rejects)",
    ...ruleLines("card"),
    "- every question in a category must point the same way as its pass: (one reversed question fails the whole gate).",
    "",
    "## Read the verdict",
    "Read `goal` (+ any `choice`) first, then the failing category, then follow the `next:` line. A stop always",
    "reads `\u2716 field: problem \u2192 fix` \u2014 the error text names exactly what to change.",
    "",
    "Go deeper: `mm3 help <verb>` (view, class, replay, scan, drill, loop) or `mm3 help <topic>`",
    "(authoring, verdict, mdl, reuse).",
    "",
    "## Tools",
    `- report: ${TOOL_LINE.report} (\`mm3 help report\`)`,
    `- outcome: ${TOOL_LINE.outcome} (\`mm3 help outcome\`)`,
    `- budget: ${TOOL_LINE.budget} (\`mm3 help budget\`)`,
    `- template: ${TOOL_LINE.template}`
  ].join("\n");
}
function agentFrontDoorLines() {
  return ['Agents: run "mm3 agent" first', "new here? \u2192 mm3 init", PITCH, ...VERBS.map((v) => `- ${v}: ${VERB_LINE[v]}`)];
}

// src/help/topics.ts
var TOPICS = ["authoring", "verdict", "mdl", "reuse", "probe"];
function authoring() {
  return [
    "## authoring",
    "How to write a request that survives its first try. Under the hood a yes/no question asks the classifier's",
    "Noul primitive, a `scale:` asks Score, and a `choice:` asks Choice \u2014 one narrow, coherent judgment per",
    "question, so keep each one to a single thing.",
    ...ruleLines("authoring"),
    "- `where:` is ALL the code a run sees \u2014 nothing outside it exists, however obvious the wiring seems.",
    '- phrase the goal as the exact claim you need proven ("this handler is safe to merge", not "review this handler") \u2014 wording changes the verdict, on purpose.',
    "- a `{blank}` in a sweep question is filled in per item; it must name that layer or one above it.",
    "- a question's number is a label for the response only \u2014 the model never sees it, so the question text itself has to carry its full meaning on its own.",
    '- a `scale:` level should name a concrete situation that stands on its own ("crashes in production"), not a bare relative point ("high").',
    "- give a `choice:` a genuine no-match option (e.g. `none`) whenever the code might fit none of the others.",
    "- ask everything you need about this evidence in one request \u2014 a second call (`drill`) is for when you need to look at something new, not more angles on what you already sent.",
    ...proseLines("authoring")
  ].join("\n");
}
function verdict() {
  return [
    "## verdict",
    "How to read what comes back:",
    ...ruleLines("verdict"),
    ...VERDICT_FACTS.map((f) => `- ${f}.`)
  ].join("\n");
}
function mdl() {
  return [
    "## mdl",
    "mdl: is optional context that never reaches the classifier \u2014 it only shapes what the ledger learns. Every",
    `field is optional; the block is capped at ${MAX_MDL_LINES} YAML lines:`,
    "",
    "| field | closed values | what you get back |",
    "|---|---|---|",
    `| why    | ${WHYS.join(", ")} | why this run happened, for later pattern-mining |`,
    `| area   | ${AREAS.join(", ")} (single, or a list of up to 2) | which slice of the system it touched |`,
    `| stage  | ${STAGES.join(", ")} | where in the workflow it landed |`,
    `| change | ${CHANGES.join(", ")} | what kind of change was under review |`,
    `| risk   | ${RISKS.join(", ")} | how risky the change looked going in |`,
    `| problem | free text, one line, 3\u2013160 chars | what the agent was solving, in its own words |`,
    `| uses   | up to 5 C4 chains: level:name ( -> level:name)* | which parts of the system this run touches |`,
    `| touches | up to 5 short entries | the entities/objects this run is about |`,
    `| blast  | ${BLASTS.join(", ")} | how far a fix's blast radius reaches |`,
    "",
    `Any other lower-kebab key (\u2264${MAX_CUSTOM_KEY_LEN} characters) is also accepted: one line or a short list,`,
    "recorded as-is. Every closed field above also accepts `unknown`. For this project's exact allowed values,",
    "run `mm3 agent mdl` \u2014 it renders the full C4 legend (the `uses` grammar, the chain examples) too.",
    "",
    ...ruleLines("mdl"),
    "- every field is optional; the response always echoes back which ones were recorded as `mdl: {recorded: [...]}`, or `{recorded: none}`."
  ].join("\n");
}
function reuse() {
  return [
    "## reuse",
    "The exact same question, asked of the exact same code, is answered for free from the ledger \u2014 no call, no",
    "spend, and the response says so. This is exact-match reuse: same evidence, same question text, same",
    "provider and model; nothing here is a semantic or fuzzy match.",
    "- `view <request-file>` checks this before you spend anything: it shows `reuse: MM3-####` when the exact",
    "  question set was already asked on unchanged code.",
    "- a sweep (scan, loop, drill on a sweep parent) reuses per item: unchanged items cost nothing, and the",
    "  response counts how many were reused.",
    "- a fully-reused run should never be blocked by the spend cap, since it spends nothing \u2014 if you see that,",
    "  it's a bug, not a feature.",
    "- reuse keys on the evidence and the question's own text, not on how the answer is graded: moving a",
    "  category's `pass:` or `need:` re-grades the same free answer instead of re-asking the question."
  ].join("\n");
}
function probe() {
  return [
    "## probe",
    "A valid probe: the shape of a well-formed question, best practice for a higher-quality answer \u2014 guidance,",
    "not new validator enforcement. Each rule below is TypeSafe's own published guidance, paraphrased, with its",
    "source page cited.",
    "",
    ...PROBE_RULES.map((r) => `- ${r.text} (TypeSafe: ${r.cite})`),
    ...ruleLines("probe"),
    "",
    'Round 3 smoke testing found this directly: a goal phrased as the vulnerability ("runs request input as code")',
    "read pass/fail backwards, and its probability stayed at p 0.98 before AND after the fix that removed the",
    "vulnerability \u2014 the wording, not the classifier, was wrong. That's rule 7 above.",
    "",
    "## Angles: a concern is one path; its ~3 probes are three angles on it",
    "This part is MM3's own model, not TypeSafe's \u2014 pick the family that matches the category's path,",
    "then write one probe per role:",
    "",
    ...FAMILY_ROLES.map((f) => `- ${f.family}: ${f.roles.join(" \xB7 ")}`),
    "",
    `A bad probe: "${BAD_PROBE_EXAMPLE.bad}" \u2014 ${BAD_PROBE_EXAMPLE.why}. Rewritten as three angles:`,
    ...BAD_PROBE_EXAMPLE.good.map((g) => `- ${g}`),
    "",
    "See the mm3-probe skill for the full model, the decisions shapes (severity scale, route/scope choice),",
    "mdl's problem/uses/touches/blast fields, and one recipe per verb."
  ].join("\n");
}
var BUILDERS = { authoring, verdict, mdl, reuse, probe };
function topicHelp(topic) {
  return BUILDERS[topic]();
}

// src/help/index.ts
var HELP_TOPICS = TOPICS;
var EXTRAS = { report: reportHelp, outcome: outcomeHelp, budget: budgetHelp, doctor: doctorHelp };
var HELP_EXTRAS = Object.keys(EXTRAS);
var isVerb2 = (s) => VERBS.includes(s);
var isTopic = (s) => TOPICS.includes(s);
function runHelp(target) {
  if (target === void 0 || target === "") return { exit: 0, text: card() };
  if (hasControlChars(target)) return { exit: 2, text: "\u2716 help: the target has control characters \u2192 use a verb or a topic name" };
  if (isVerb2(target)) return { exit: 0, text: verbHelp(target) };
  if (isTopic(target)) return { exit: 0, text: topicHelp(target) };
  if (Object.hasOwn(EXTRAS, target)) return { exit: 0, text: EXTRAS[target]() };
  return {
    exit: 2,
    text: `\u2716 help: "${clip(target, 40)}" is not a verb or topic \u2192 one of ${VERBS.join(", ")}, or a topic: ${TOPICS.join(", ")}, or ${HELP_EXTRAS.map((t) => `"${t}"`).join(", ")}`
  };
}

// src/mcp/actor.ts
function resolveMcpActor() {
  return "claude";
}

// src/util/plugin-build.ts
import { readFileSync as readFileSync24, realpathSync as realpathSync7 } from "node:fs";
import path26 from "node:path";
var real = (p) => {
  try {
    return realpathSync7(p);
  } catch {
    return path26.resolve(p);
  }
};
function pluginCommit(packageDir, homeDir, env) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path26.join(homeDir, ".claude");
  let record2;
  try {
    record2 = JSON.parse(readFileSync24(path26.join(claudeDir, "plugins", "installed_plugins.json"), "utf8"));
  } catch {
    return void 0;
  }
  const plugins = record2?.plugins;
  if (!plugins || typeof plugins !== "object") return void 0;
  const here = real(packageDir);
  for (const [name, installs] of Object.entries(plugins)) {
    if (!name.startsWith("mm3@") || !Array.isArray(installs)) continue;
    for (const i of installs) {
      if (typeof i?.installPath === "string" && typeof i.gitCommitSha === "string" && real(i.installPath) === here) return i.gitCommitSha.slice(0, 12);
    }
  }
  return void 0;
}
function pluginInstallInfo(homeDir, env) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path26.join(homeDir, ".claude");
  let record2;
  try {
    record2 = JSON.parse(readFileSync24(path26.join(claudeDir, "plugins", "installed_plugins.json"), "utf8"));
  } catch {
    return void 0;
  }
  const plugins = record2?.plugins;
  if (!plugins || typeof plugins !== "object") return void 0;
  let best;
  for (const [name, installs] of Object.entries(plugins)) {
    if (!name.startsWith("mm3@") || !Array.isArray(installs)) continue;
    for (const i of installs) {
      if (typeof i?.gitCommitSha !== "string") continue;
      if (!best || String(i.lastUpdated ?? "") > String(best.lastUpdated ?? "")) best = i;
    }
  }
  if (!best || typeof best.gitCommitSha !== "string") return void 0;
  const sha2 = best.gitCommitSha.slice(0, 12);
  if (typeof best.installPath !== "string") return { sha: sha2 };
  try {
    const meta = JSON.parse(readFileSync24(path26.join(best.installPath, "package.json"), "utf8"));
    return typeof meta.version === "string" ? { version: meta.version, sha: sha2 } : { sha: sha2 };
  } catch {
    return { sha: sha2 };
  }
}

// src/cli.ts
var PACKAGE_DIR = path27.join(path27.dirname(fileURLToPath2(import.meta.url)), "..");
var LINES3 = {
  view: "mm3 view <folder | tag | MM3-#### | request-file | -> [--level 1|2|3] [--summary]",
  class: "mm3 class <request-file | -> [--dry-run]",
  replay: "mm3 replay <request-file | -> [--dry-run]  \xB7  or: mm3 replay --parent MM3-#### --compare <before>..<after> [--dry-run]",
  scan: "mm3 scan <request-file | -> [--dry-run]",
  drill: "mm3 drill <request-file | -> [--dry-run]",
  loop: "mm3 loop <request-file | -> [--dry-run]",
  template: "mm3 template <view|class|replay|scan|drill|loop> [--parent MM3-#### --from <item-or-category>]  \xB7  or: --from <request.yaml> [--where <path>]... [--goal <text>]",
  help: `mm3 help [${VERBS.join("|")}|${HELP_TOPICS.join("|")}|${HELP_EXTRAS.join("|")}]`,
  agent: `mm3 agent [${VERBS.join("|")}|${AGENT_EXTRAS.join("|")}]`,
  report: "mm3 report [hits|patterns|history]",
  outcome: "mm3 outcome <MM3-####> held|overruled|failed --by <actor>",
  budget: "mm3 budget [show]",
  doctor: "mm3 doctor [<file> | -]",
  config: "mm3 config [--write | --load [file]]",
  init: "mm3 init [--global | --user | --local] [--claude | --no-claude] [--scope user|project] [--key-stdin | --no-key] [--yes]  \xB7  or: mm3 init --agents [--yes]",
  uninstall: "mm3 uninstall [--all] [--keep-key] [--keep-data] [--yes]",
  mcp: "mm3 mcp"
};
var USAGE = `${agentFrontDoorLines().join("\n")}
usage:
${Object.values(LINES3).map((l) => `  ${l}`).join("\n")}`;
var isCommand = (c) => Object.hasOwn(LINES3, c);
var AGENT_POINTABLE = /* @__PURE__ */ new Set([...VERBS, "report", "outcome", "budget", "template", "doctor"]);
var withAgentPointer = (text, command) => AGENT_POINTABLE.has(command) ? `${text}
\u2192 see: mm3 agent ${command}` : text;
var UsageStop = class extends Error {
  constructor(command, problem) {
    super(withAgentPointer(`\u2716 args: ${problem} \u2192 ${LINES3[command]}`, command));
    this.name = "UsageStop";
  }
};
var isFolder = (p) => {
  try {
    return statSync5(p).isDirectory();
  } catch {
    return false;
  }
};
var OUTCOMES = ["held", "overruled", "failed"];
var NO_PROJECT = '\u2716 project: no .mm3 or .git folder here or above \u2192 run inside a project, or "mkdir .mm3" to start one here';
var DEFAULT_REQUEST_MAX_BYTES = 1048576;
var tooBig = (maxBytes) => `\u2716 request: larger than ${maxBytes === DEFAULT_REQUEST_MAX_BYTES ? "1 MB" : `${maxBytes} bytes`} \u2192 a request is a short text file; point "where:" at the code instead`;
function finish(code, text) {
  return { exit: code, text: text.endsWith("\n") ? text : `${text}
` };
}
function args(command, config) {
  try {
    return parseArgs(config);
  } catch (e) {
    const code = e.code;
    const quoted = /'([^']*)'/.exec(e.message)?.[1] ?? "";
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") throw new UsageStop(command, `unknown flag ${clip(quoted, 40)}`);
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") throw new UsageStop(command, `${quoted.split(" ")[0]} needs a value`);
    if (code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") throw new UsageStop(command, `extra argument "${clip(quoted, 40)}"`);
    throw new UsageStop(command, "bad arguments");
  }
}
function positionalCount(command, positionals, min, max) {
  if (positionals.length < min) throw new UsageStop(command, "missing arguments");
  if (positionals.length > max) throw new UsageStop(command, `extra argument "${clip(positionals[max], 40)}"`);
}
function givenTwice(argv, names) {
  const name = names.find((n) => argv.filter((a) => a === `--${n}` || a.startsWith(`--${n}=`)).length > 1);
  return name === void 0 ? void 0 : `\u2716 --${name}: given twice \u2192 give it once`;
}
function readRequest(file, stdinSource, maxBytes = DEFAULT_REQUEST_MAX_BYTES) {
  if (hasControlChars(file)) return { stop: "\u2716 request: the file name has control characters \u2192 pass a plain path, or - to read stdin" };
  const shown2 = clip(file, 60);
  let bytes;
  try {
    if (file !== "-") {
      const st = statSync5(file);
      if (st.isDirectory()) return { stop: `\u2716 request: ${shown2} is a folder \u2192 pass a request file, or - to read stdin` };
      if (st.size > maxBytes) return { stop: tooBig(maxBytes) };
    }
    bytes = file === "-" ? stdinSource() : readFileSync25(file);
  } catch (e) {
    const code = e.code;
    if (code === "ENOENT") return { stop: `\u2716 request: ${shown2} not found \u2192 check the path, or pass - to read stdin` };
    return { stop: `\u2716 request: cannot read ${shown2} (${code ?? "error"}) \u2192 check the path and its permissions` };
  }
  if (bytes.length > maxBytes) return { stop: tooBig(maxBytes) };
  if (bytes.includes(0)) return { stop: `\u2716 request: ${file === "-" ? "stdin" : shown2} is binary, not text \u2192 write the request as YAML, starting "mak:"` };
  return { text: bytes.toString("utf8") };
}
var configStopText = (stops) => `${stops.map((s) => s.text).join("\n")}
\u2716 config: paid runs stop until .mm3/config.yaml is fixed \u2192 fix it, then run mm3 config --load
\u2192 see: mm3 agent config`;
var RUNNERS = { class: runClass, scan: runScan, drill: runDrill, loop: runLoop };
var resolveStoredFor = (c) => () => resolveStoredKey(c.runner, c.platform, c.env);
var providerExit = (e) => e instanceof JevConfigError ? e.exit : 1;
async function runSweptVerb(command, rest, paths, ctx) {
  const twice = givenTwice(rest, ["dry-run"]);
  if (twice) return finish(2, withAgentPointer(twice, command));
  const { values, positionals } = args(command, { args: rest, allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
  positionalCount(command, positionals, 1, 1);
  const fileConfig = resolveConfig(paths, ctx.env);
  if (fileConfig.stops.length) return finish(2, configStopText(fileConfig.stops));
  const read3 = readRequest(positionals[0], ctx.stdin, fileConfig.config.requestMaxBytes);
  if ("stop" in read3) return finish(2, withAgentPointer(read3.stop, command));
  let provider;
  try {
    provider = selectProvider(ctx.env, { chaosState: path27.join(paths.dir, "chaos.json"), resolveStored: resolveStoredFor(ctx), fileConfig: classifierFileConfig(fileConfig.config) });
  } catch (e) {
    return finish(providerExit(e), e.message);
  }
  const r = await RUNNERS[command](read3.text, { paths, provider, env: ctx.env, config: fileConfig, dryRun: values["dry-run"], resolveStored: resolveStoredFor(ctx) });
  return finish(r.exit, r.text);
}
async function dispatch(argv, ctx) {
  const [command = "", ...rest] = argv;
  if (command === "") return finish(2, USAGE);
  if (command === "--help" || command === "-h") return finish(0, USAGE);
  if (command === "--version" || command === "-v") {
    const commit = pluginCommit(ctx.packageDir, ctx.homeDir, ctx.env);
    return finish(0, commit ? `${ctx.pkg.version} (plugin ${commit})` : ctx.pkg.version);
  }
  if (!isCommand(command)) {
    const later = argv.find(isCommand);
    if (command.startsWith("-") && later) throw new UsageStop(later, `"${clip(command, 40)}" comes before the command`);
    return finish(2, `\u2716 args: "${clip(command, 40)}" is not a command \u2192 use view, class, replay, scan, drill, loop, template, help, agent, report, outcome, budget, doctor, config, init, uninstall or mcp (mm3 --help)`);
  }
  if (rest.includes("--help") || rest.includes("-h")) {
    const seeMore = VERBS.includes(command) ? `
\u2192 see: mm3 help ${command} \xB7 mm3 agent ${command}` : "";
    return finish(0, `${LINES3[command]}${seeMore}`);
  }
  if (command !== "doctor" && command !== "mcp") {
    const nodeStop = nodeVersionStop(ctx.nodeVersion);
    if (nodeStop) return finish(2, nodeStop);
  }
  if (command === "template") {
    const twice = givenTwice(rest, ["parent", "from", "goal"]);
    if (twice) return finish(2, withAgentPointer(twice, command));
    const { values, positionals } = args("template", {
      args: rest,
      allowPositionals: true,
      options: { parent: { type: "string" }, from: { type: "string" }, where: { type: "string", multiple: true }, goal: { type: "string" } }
    });
    positionalCount("template", positionals, 1, 1);
    const r = runTemplate(
      positionals[0],
      { parent: values.parent, from: values.from, where: values.where, goal: values.goal },
      resolvePaths(ctx.cwd, ctx.env),
      ctx.packageDir
    );
    return finish(r.exit, r.text);
  }
  if (command === "help") {
    const { positionals } = args("help", { args: rest, allowPositionals: true, options: {} });
    positionalCount("help", positionals, 0, 1);
    const r = runHelp(positionals[0]);
    return finish(r.exit, r.text);
  }
  if (command === "agent") {
    const { positionals } = args("agent", { args: rest, allowPositionals: true, options: {} });
    positionalCount("agent", positionals, 0, 1);
    const r = runAgent(positionals[0], ctx.env, { resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env), paths: resolvePaths(ctx.cwd, ctx.env) });
    return finish(r.exit, r.text);
  }
  if (command === "doctor") {
    const { positionals } = args("doctor", { args: rest, allowPositionals: true, options: {} });
    positionalCount("doctor", positionals, 0, 1);
    if (positionals.length === 1) {
      const read3 = readRequest(positionals[0], ctx.stdin);
      if ("stop" in read3) return finish(2, withAgentPointer(read3.stop, "doctor"));
      const r2 = runDoctorFile(read3.text);
      return finish(r2.exit, r2.text);
    }
    const r = runDoctor(ctx.env, resolvePaths(ctx.cwd, ctx.env), ctx.nodeVersion, {
      resolveStored: () => resolveStoredKey(ctx.runner, ctx.platform, ctx.env),
      runner: ctx.runner,
      platform: ctx.platform,
      version: ctx.pkg.version,
      pluginInstall: pluginInstallInfo(ctx.homeDir, ctx.env)
    });
    return finish(r.exit, r.text.includes("\u2716") ? endWithAgentPointer(r.text, "doctor") : r.text);
  }
  if (command === "config") {
    const { positionals, values } = args("config", { args: rest, allowPositionals: true, options: { write: { type: "boolean" }, load: { type: "boolean" } } });
    if (values.load && values.write) throw new UsageStop("config", "--load and --write cannot go together \u2192 run mm3 config --write first, edit the file, then mm3 config --load");
    positionalCount("config", positionals, 0, values.load ? 1 : 0);
    const configPaths = resolvePaths(ctx.cwd, ctx.env);
    const projectLine2 = configPaths ? path27.relative(ctx.cwd, configPaths.root) || "." : "none";
    const r = values.load ? runConfigLoad(configPaths, positionals[0], ctx.cwd, projectLine2) : values.write ? runConfigWrite(configPaths, projectLine2) : runConfig(ctx.env, configPaths, projectLine2);
    return finish(r.exit, r.text);
  }
  if (command === "mcp") {
    const { positionals } = args("mcp", { args: rest, allowPositionals: true, options: {} });
    positionalCount("mcp", positionals, 0, 0);
    await runMcpServer(
      ctx.io,
      (a, stdinText, project) => {
        const nodeStop = nodeVersionStop(ctx.nodeVersion);
        if (nodeStop) return Promise.resolve(finish(2, endWithAgentPointer(nodeStop)));
        const env = { ...ctx.env };
        if (project) env.MM3_HOME = project;
        if (!env.MM3_ACTOR?.trim()) env.MM3_ACTOR = resolveMcpActor();
        return runCli(a, { ...ctx, env, stdin: () => Buffer.from(stdinText ?? "", "utf8") });
      },
      ctx.pkg.version
    );
    return { exit: 0, text: "" };
  }
  if (command === "init") {
    const twice = givenTwice(rest, ["scope"]);
    if (twice) return finish(2, twice);
    const { values, positionals } = args("init", {
      args: rest,
      allowPositionals: true,
      options: {
        global: { type: "boolean", default: false },
        user: { type: "boolean", default: false },
        local: { type: "boolean", default: false },
        claude: { type: "boolean", default: false },
        "no-claude": { type: "boolean", default: false },
        scope: { type: "string" },
        "key-stdin": { type: "boolean", default: false },
        "no-key": { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
        agents: { type: "boolean", default: false }
      }
    });
    positionalCount("init", positionals, 0, 0);
    if ([values.global, values.user, values.local].filter(Boolean).length > 1) {
      return finish(2, "\u2716 init: give at most one of --global, --user or --local \u2192 pick one, or none to let init choose");
    }
    if (values.agents && (values.global || values.user || values.local || values.claude || values["no-claude"] || values["key-stdin"] || values["no-key"] || values.scope !== void 0)) {
      return finish(2, '\u2716 init: --agents runs on its own \u2192 run "mm3 init --agents [--yes]" alone (and "mm3 init" separately for the install, key and plugin)');
    }
    if (values.claude && values["no-claude"]) return finish(2, "\u2716 init: give at most one of --claude or --no-claude \u2192 pick one, or neither to let init decide");
    if (values["key-stdin"] && values["no-key"]) return finish(2, "\u2716 init: give at most one of --key-stdin or --no-key \u2192 pick one, or neither to be asked");
    if (values.scope !== void 0 && values.scope !== "user" && values.scope !== "project") {
      return finish(2, `\u2716 --scope: "${clip(values.scope, 20)}" is not user or project \u2192 use --scope user or --scope project`);
    }
    const flags = {
      mode: values.global ? "global" : values.user ? "user" : values.local ? "local" : void 0,
      claude: values.claude ? true : values["no-claude"] ? false : void 0,
      scope: values.scope,
      key: values["key-stdin"] ? "stdin" : values["no-key"] ? "no" : "ask",
      yes: values.yes,
      ...values.agents ? { agents: true } : {}
    };
    const r = await runInit(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      keyStdin: flags.key === "stdin" ? ctx.io.input : void 0,
      packageDir: ctx.packageDir,
      pkg: ctx.pkg,
      homeDir: ctx.homeDir
    });
    return finish(r.exit, r.text);
  }
  if (command === "uninstall") {
    const { values, positionals } = args("uninstall", {
      args: rest,
      allowPositionals: true,
      options: {
        all: { type: "boolean", default: false },
        "keep-key": { type: "boolean", default: false },
        "keep-data": { type: "boolean", default: false },
        yes: { type: "boolean", default: false }
      }
    });
    positionalCount("uninstall", positionals, 0, 0);
    const flags = { all: values.all, keepKey: values["keep-key"], keepData: values["keep-data"], yes: values.yes };
    const r = await runUninstall(flags, {
      env: ctx.env,
      cwd: ctx.cwd,
      platform: ctx.platform,
      runner: ctx.runner,
      io: ctx.io,
      homeDir: ctx.homeDir,
      pkgName: ctx.pkg.name
    });
    return finish(r.exit, r.text);
  }
  const paths = resolvePaths(ctx.cwd, ctx.env);
  if (!paths) return finish(2, withAgentPointer(NO_PROJECT, command));
  if (!isFolder(paths.root)) return finish(2, withAgentPointer(`\u2716 project: "${clip(paths.root, 80)}" is not a folder \u2192 give an existing project folder (MM3_HOME, or the plugin's project field)`, command));
  let resolvedOnce;
  const resolved = () => resolvedOnce ??= resolveConfig(paths, ctx.env);
  switch (command) {
    case "view": {
      const twice = givenTwice(rest, ["level", "answers"]);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args("view", {
        args: rest,
        allowPositionals: true,
        options: { level: { type: "string", default: "1" }, summary: { type: "boolean", default: false }, answers: { type: "boolean", default: false } }
      });
      positionalCount("view", positionals, 1, 1);
      if (!["1", "2", "3"].includes(values.level)) {
        return finish(2, withAgentPointer(`\u2716 --level: "${clip(values.level, 20)}" is not a level \u2192 use --level 1, 2 or 3`, command));
      }
      const arg = positionals[0];
      let content;
      if (arg === "-") {
        content = ctx.stdin().toString("utf8");
      } else {
        try {
          content = readFileSync25(arg, "utf8");
        } catch {
        }
      }
      const r = runView(arg, Number(values.level), { paths, env: ctx.env, config: resolved(), resolveStored: resolveStoredFor(ctx) }, content, values.summary, values.answers);
      return finish(r.exit, r.text);
    }
    case "report": {
      const twice = givenTwice(rest, ["accept"]);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args("report", { args: rest, allowPositionals: true, options: { accept: { type: "string" } } });
      positionalCount("report", positionals, 0, 2);
      const r = runReport(positionals[0], { paths, env: ctx.env, config: resolved(), runner: ctx.runner, platform: ctx.platform }, positionals[1], values.accept);
      return finish(r.exit, r.text);
    }
    case "class":
    case "scan":
    case "drill":
    case "loop":
      return runSweptVerb(command, rest, paths, ctx);
    case "replay": {
      const twice = givenTwice(rest, ["dry-run", "parent", "compare", "expect"]);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args("replay", {
        args: rest,
        allowPositionals: true,
        options: { "dry-run": { type: "boolean", default: false }, parent: { type: "string" }, compare: { type: "string" }, expect: { type: "string" } }
      });
      if (resolved().stops.length) return finish(2, configStopText(resolved().stops));
      const usingFlags = values.parent !== void 0 || values.compare !== void 0;
      let text;
      if (usingFlags) {
        if (values.parent === void 0 || values.compare === void 0) {
          return finish(2, withAgentPointer("\u2716 --parent/--compare: give both, or neither \u2192 mm3 replay --parent MM3-#### --compare <before>..<after>", command));
        }
        positionalCount("replay", positionals, 0, 0);
        const sep = values.compare.indexOf("..");
        if (sep <= 0 || sep >= values.compare.length - 2) {
          return finish(2, withAgentPointer(`\u2716 --compare: "${clip(values.compare, 60)}" is not <before>..<after> \u2192 e.g. --compare main..HEAD`, command));
        }
        const parentRun = findRun(paths, values.parent);
        const goal = parentRun && isContractRun(parentRun) ? parentRun.goal : "The change works";
        const expect = values.expect ? values.expect.split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (expect.length === 0) {
          const concernNames = parentRun && isContractRun(parentRun) ? parentRun.ask.categories.filter((c) => c.section !== "decisions").map((c) => c.name) : [];
          const sample = concernNames.length > 0 ? concernNames.join(",") : "injection,guards";
          return finish(
            2,
            withAgentPointer(`\u2716 --expect: name the concerns this replay should fix \u2192 mm3 replay --parent MM3-#### --compare <before>..<after> --expect ${sample}`, command)
          );
        }
        text = (0, import_yaml6.stringify)({ mak: { goal, parent: values.parent, compare: { before: values.compare.slice(0, sep), after: values.compare.slice(sep + 2) }, expect } });
      } else {
        positionalCount("replay", positionals, 1, 1);
        const read3 = readRequest(positionals[0], ctx.stdin, resolved().config.requestMaxBytes);
        if ("stop" in read3) return finish(2, withAgentPointer(read3.stop, command));
        text = read3.text;
      }
      let provider;
      try {
        provider = selectProvider(ctx.env, {
          chaosState: path27.join(paths.dir, "chaos.json"),
          resolveStored: resolveStoredFor(ctx),
          fileConfig: classifierFileConfig(resolved().config)
        });
      } catch (e) {
        return finish(providerExit(e), e.message);
      }
      const r = await runReplay(text, { paths, provider, env: ctx.env, config: resolved(), dryRun: values["dry-run"], resolveStored: resolveStoredFor(ctx) });
      return finish(r.exit, r.text);
    }
    case "outcome": {
      const twice = givenTwice(rest, ["by"]);
      if (twice) return finish(2, withAgentPointer(twice, command));
      const { values, positionals } = args("outcome", { args: rest, allowPositionals: true, options: { by: { type: "string" } } });
      positionalCount("outcome", positionals, 2, 2);
      const [id = "", outcome = ""] = positionals;
      if (!RUN_ID.test(id)) {
        return finish(2, withAgentPointer(`\u2716 outcome: "${clip(id, 40)}" is not a run id \u2192 use the MM3-#### that class printed, e.g. MM3-0001`, command));
      }
      if (!OUTCOMES.includes(outcome)) {
        return finish(2, withAgentPointer(`\u2716 outcome: "${clip(outcome, 40)}" is not an outcome \u2192 use held, overruled or failed`, command));
      }
      const by = values.by?.trim();
      if (!by) return finish(2, withAgentPointer("\u2716 --by: missing \u2192 add --by <who judged the run>", command));
      const { record: record2, repeat } = appendOutcome(paths, id, outcome, by);
      return finish(0, `mm3 outcome ${record2.of} ${record2.outcome} \xB7 ${repeat ? "already recorded " : ""}by ${record2.by}`);
    }
    case "budget": {
      const [sub = "show", ...more] = rest;
      if (sub === "set") return finish(2, withAgentPointer(`\u2716 budget: set was removed \u2192 edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load`, command));
      if (sub === "reset") {
        return finish(2, withAgentPointer("\u2716 budget: reset was removed \u2192 change budget.usd or budget.runs in .mm3/config.yaml and run mm3 config --load (a changed budget restarts the count), or set budget.since to now", command));
      }
      if (sub !== "show") throw new UsageStop("budget", `"${clip(sub, 40)}" is not show`);
      positionalCount("budget", more, 0, 0);
      const line3 = budgetLine(loadBudget(paths).state);
      return finish(0, line3.startsWith("\u26A0") ? line3 : `${line3}
\u2192 to change it: edit budget.usd / budget.runs in .mm3/config.yaml, then run mm3 config --load`);
    }
  }
  return finish(1, `\u2716 mm3: internal: unhandled command "${command}"`);
}
async function runCli(argv, ctx) {
  const r = await runCaught(argv, ctx);
  return r.exit === 0 ? r : { exit: r.exit, text: endWithAgentPointer(r.text, argv[0]) };
}
async function runCaught(argv, ctx) {
  try {
    return await dispatch(argv, ctx);
  } catch (e) {
    if (e instanceof UsageStop) return finish(2, e.message);
    if (e instanceof BudgetError) return finish(3, e.message);
    if (e instanceof LedgerError) return finish(e.exit, e.message);
    if (e instanceof JevConfigError) return finish(e.exit, e.message);
    if (e instanceof LockError || e instanceof StoreError) return finish(1, e.message);
    const plain = systemStop(e);
    if (plain) return finish(1, plain);
    const text = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 200);
    return finish(1, `\u2716 mm3: ${text} \u2192 retry; if it repeats, report it with the command you ran`);
  }
}
var FS_WORDS = {
  EISDIR: "a file MM3 reads is a folder",
  ENOTDIR: "a folder MM3 needs is a file",
  EACCES: "MM3 may not read or write a file",
  EPERM: "MM3 may not read or write a file",
  ENOENT: "a file MM3 needs is missing",
  ENOSPC: "the disk is full",
  EROFS: "the disk is read-only"
};
function systemStop(e) {
  const err2 = e;
  const what = typeof err2?.code === "string" ? FS_WORDS[err2.code] : void 0;
  if (!what) return void 0;
  const where = typeof err2?.path === "string" ? ` (${clip(path27.basename(err2.path), 40)})` : "";
  return `\u2716 files: ${what}${where} \u2192 check .mm3/ (log.jsonl and budget.json are files, the folder is writable), then re-run`;
}
function realCtx() {
  return {
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
    runner: realRunner,
    packageDir: PACKAGE_DIR,
    pkg: { name: package_default.name, version: package_default.version },
    homeDir: os3.homedir(),
    nodeVersion: process.version,
    stdin: () => readFileSync25(0),
    get io() {
      return { input: process.stdin, output: process.stdout };
    }
  };
}
function isEntrypoint() {
  if (isStandalone()) return true;
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return realpathSync8(invoked) === realpathSync8(fileURLToPath2(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntrypoint() && isHookLaunch(process.argv)) {
  runEmbeddedHook();
} else if (isEntrypoint()) {
  runCli(process.argv.slice(2), realCtx()).then((r) => {
    if (r.text) (r.exit === 0 ? process.stdout : process.stderr).write(r.text);
    process.exitCode = r.exit;
  }).catch((e) => {
    process.stderr.write(`\u2716 mm3: ${e instanceof Error ? e.message : String(e)} \u2192 retry; if it repeats, report it with the command you ran
`);
    process.exitCode = 1;
  });
}
export {
  runCli
};
