"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = asyncToBluebird;

var _traverse = _interopRequireDefault(require("@babel/traverse"));

var _helperFunctionName = _interopRequireDefault(require("@babel/helper-function-name"));

var _babelTemplate = _interopRequireDefault(require("babel-template"));

var _helperModuleImports = require("@babel/helper-module-imports");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import syntaxAsyncFunctions from '@babel/plugin-syntax-async-generators';
const FUNCTION_TYPES = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'];
const BUILD_WRAPPER = (0, _babelTemplate.default)(`
	(() => {
		var REF = FUNCTION;
		return function NAME(PARAMS) {
			return REF.apply(this, arguments);
		};
	})
`);
const NAMED_BUILD_WRAPPER = (0, _babelTemplate.default)(`
	(() => {
		var REF = FUNCTION;
		function NAME(PARAMS) {
			return REF.apply(this, arguments);
		}
		return NAME;
	})
`);

function asyncToBluebird(pluginArg) {
  const {
    types: t
  } = pluginArg;

  function classOrObjectMethod(path, state, hasAwait) {
    const {
      node
    } = path;
    const {
      body
    } = node;
    node.async = false;
    node.generator = false;
    const container = t.functionExpression(null, [], t.blockStatement(body.body), hasAwait);
    container.shadow = true;
    const bbImport = (0, _helperModuleImports.addNamed)(path, 'bluebird', hasAwait ? 'coroutine' : 'method');
    body.body = [t.returnStatement(t.callExpression(t.callExpression(bbImport, [container]), []))];
  }

  function plainFunction(path, state, hasAwait) {
    const {
      node
    } = path;
    const isDeclaration = path.isFunctionDeclaration();
    const asyncFnId = node.id;
    let wrapper = BUILD_WRAPPER;
    if (path.isArrowFunctionExpression()) path.arrowFunctionToShadowed();else if (!isDeclaration && asyncFnId) wrapper = NAMED_BUILD_WRAPPER;
    node.async = false;
    node.generator = hasAwait;
    node.id = null;
    if (isDeclaration) node.type = 'FunctionExpression';
    const bbImport = (0, _helperModuleImports.addNamed)(path, 'bluebird', hasAwait ? 'coroutine' : 'method');
    const built = t.callExpression(bbImport, [node]);
    const container = wrapper({
      NAME: asyncFnId,
      REF: path.scope.generateUidIdentifier('ref'),
      FUNCTION: built,
      PARAMS: node.params.map(() => path.scope.generateUidIdentifier('x'))
    }).expression;

    if (isDeclaration) {
      const declar = t.variableDeclaration('let', [t.variableDeclarator(t.identifier(asyncFnId.name), t.callExpression(container, []))]);
      declar._blockHoist = true;
      path.replaceWith(declar);
    } else {
      const retFunction = container.body.body[1].argument;

      if (!asyncFnId) {
        (0, _helperFunctionName.default)({
          node: retFunction,
          parent: path.parent,
          scope: path.scope
        });
      }

      if (!retFunction || retFunction.id || node.params.length) {
        // we have an inferred function id or params so we need this wrapper
        path.replaceWith(t.callExpression(container, []));
      } else {
        // we can omit this wrapper as the conditions it protects for do not apply
        path.replaceWith(built);
      }
    }
  }

  return {
    // inherits: syntaxAsyncFunctions,
    visitor: {
      Function(path, state) {
        const {
          node,
          scope
        } = path;
        if (!node.async || node.generator) return;

        const hasAwait = _traverse.default.hasType(node.body, scope, 'AwaitExpression', FUNCTION_TYPES);

        (0, _traverse.default)(node, {
          blacklist: FUNCTION_TYPES,

          AwaitExpression(path2) {
            // eslint-disable-next-line no-param-reassign
            path2.node.type = 'YieldExpression';
            path2.node.argument = t.callExpression((0, _helperModuleImports.addNamed)(path, 'bluebird', 'resolve'), [path2.node.argument]);
          }

        }, scope);
        const isClassOrObjectMethod = path.isClassMethod() || path.isObjectMethod();
        (isClassOrObjectMethod ? classOrObjectMethod : plainFunction)(path, state, hasAwait);
      }

    }
  };
}

//# sourceMappingURL=main.es6.js.map