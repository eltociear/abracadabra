import { Editor, Code, ErrorReason } from "../../editor/editor";
import { Selection } from "../../editor/selection";
import * as t from "../../ast";
import {
  askReplacementStrategy,
  ReplacementStrategy
} from "../../replacement-strategy";

export { extractGenericType, createVisitor };

async function extractGenericType(
  code: Code,
  selection: Selection,
  editor: Editor
) {
  const ast = t.parse(code);

  const {
    selected: selectedOccurrence,
    others: otherOccurrences
  } = findAllOccurrences(ast, selection);

  if (!selectedOccurrence) {
    editor.showError(ErrorReason.DidNotFindTypeToExtract);
    return;
  }

  const choice = await askReplacementStrategy(otherOccurrences, editor);
  const occurrences =
    choice === ReplacementStrategy.AllOccurrences
      ? otherOccurrences.concat(selectedOccurrence)
      : [selectedOccurrence];

  occurrences.forEach(occurrence => occurrence.transform());

  await editor.write(t.print(ast));
}

function findAllOccurrences(ast: t.AST, selection: Selection): AllOccurrences {
  let selectedOccurrence: Occurrence | null = null;
  let otherOccurrences: Occurrence[] = [];

  t.traverseAST(
    ast,
    createVisitor(
      selection,
      path => (selectedOccurrence = new Occurrence(path)),
      path => otherOccurrences.push(new Occurrence(path))
    )
  );

  return {
    selected: selectedOccurrence,
    others: otherOccurrences.filter(
      occurrence =>
        selectedOccurrence &&
        t.areEqual(occurrence.node, selectedOccurrence.node) &&
        // Don't include the selected occurrence
        !Selection.areEqual(occurrence.path, selectedOccurrence.path)
    )
  };
}

interface AllOccurrences {
  selected: Occurrence | null;
  others: Occurrence[];
}

class Occurrence {
  constructor(readonly path: t.SelectablePath<t.TSTypeAnnotation>) {}

  get node(): t.Selectable<t.TSTypeAnnotation> {
    return this.path.node;
  }

  transform() {
    const genericTypeName = "T";
    const genericTypeAnnotation = t.tsTypeAnnotation(
      t.tsTypeReference(t.identifier(genericTypeName))
    );

    if (t.isTSInterfaceDeclaration(this.path.parentPath.parentPath.parent)) {
      const typeParameter = t.tsTypeParameter(
        undefined,
        this.path.node.typeAnnotation,
        genericTypeName
      );

      this.path.parentPath.parentPath.parent.typeParameters = t.tsTypeParameterDeclaration(
        [typeParameter]
      );
    }

    this.path.replaceWith(genericTypeAnnotation);
  }
}

function createVisitor(
  selection: Selection,
  onMatch: (path: t.SelectablePath<t.TSTypeAnnotation>) => void,
  onVisit: (path: t.SelectablePath<t.TSTypeAnnotation>) => void = () => {}
): t.Visitor {
  return {
    TSTypeAnnotation(path) {
      if (!t.isSelectablePath(path)) return;

      onVisit(path);
      if (!selection.isInsidePath(path)) return;

      onMatch(path);
    }
  };
}
