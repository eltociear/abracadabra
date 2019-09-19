import { singular } from "pluralize";

import { Editor, Code, ErrorReason } from "../../editor/editor";
import { Selection } from "../../editor/selection";
import * as ast from "../../ast";

export { convertForToForeach, canConvertForLoop };

async function convertForToForeach(
  code: Code,
  selection: Selection,
  editor: Editor
) {
  const updatedCode = updateCode(code, selection);

  if (!updatedCode.hasCodeChanged) {
    editor.showError(ErrorReason.DidNotFoundForLoopToConvert);
    return;
  }

  await editor.write(updatedCode.code);
}

function canConvertForLoop(code: Code, selection: Selection): boolean {
  return updateCode(code, selection).hasCodeChanged;
}

function updateCode(code: Code, selection: Selection): ast.Transformed {
  return ast.transform(code, {
    ForStatement(path) {
      const { test, body } = path.node;
      if (!ast.isBinaryExpression(test)) return;

      const right = test.right;
      if (!ast.isMemberExpression(right)) return;
      if (!ast.isIdentifier(right.object)) return;

      const list = right.object;
      const item = ast.identifier(singular(right.object.name));
      const forEachBody = ast.isBlockStatement(body)
        ? body
        : ast.blockStatement([body]);

      replaceListWithItemIn(forEachBody, list, item, path.scope);

      path.replaceWith(ast.forEach(list, [item], forEachBody));
      path.stop();
    }
  });
}

function replaceListWithItemIn(
  statement: ast.BlockStatement,
  list: ast.Identifier,
  item: ast.Identifier,
  scope: ast.Scope
) {
  ast.traverseAST(
    statement,
    {
      MemberExpression(path) {
        if (!ast.areEqual(path.node.object, list)) return;
        path.replaceWith(item);
      }
    },
    scope
  );
}
