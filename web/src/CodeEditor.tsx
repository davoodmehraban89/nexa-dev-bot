import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
  keymap,
  drawSelection
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting
} from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';

function languageFor(path: string) {
  if (/\.(jsx?|tsx?|mjs|cjs)$/i.test(path))
    return javascript({
      typescript: /\.tsx?$/i.test(path),
      jsx: /\.[jt]sx$/i.test(path)
    });
  if (/\.json$/i.test(path)) return json();
  if (/\.css$/i.test(path)) return css();
  if (/\.(html?|svg)$/i.test(path)) return html();
  return [];
}
export function CodeEditor({
  value,
  path,
  readOnly,
  fontSize,
  onChange
}: {
  value: string;
  path: string;
  readOnly: boolean;
  fontSize: number;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  const editable = useRef(new Compartment());
  const typography = useRef(new Compartment());
  callback.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const nonce =
      document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')
        ?.content || '';
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.cspNonce.of(nonce),
          EditorState.phrases.of({
            'Find': 'جست‌وجو',
            'Replace': 'جایگزین',
            'next': 'بعدی',
            'previous': 'قبلی',
            'all': 'همه',
            'match case': 'حساس به حروف',
            'regexp': 'عبارت منظم',
            'by word': 'واژه کامل',
            'replace': 'جایگزینی',
            'replace all': 'جایگزینی همه',
            'close': 'بستن',
            'Go to line': 'رفتن به خط',
            'go': 'برو',
            'current match': 'نتیجه فعلی',
            'on line': 'در خط',
            'replaced match on line $': 'نتیجه خط $ جایگزین شد',
            'replaced $ matches': '$ نتیجه جایگزین شد'
          }),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          search({ top: true }),
          syntaxHighlighting(defaultHighlightStyle),
          languageFor(path),
          keymap.of([
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap
          ]),
          EditorView.contentAttributes.of({
            'aria-label': `ویرایش ${path}`,
            'dir': 'ltr',
            'spellcheck': 'false',
            'autocapitalize': 'off',
            'autocomplete': 'off'
          }),
          editable.current.of(EditorState.readOnly.of(readOnly)),
          typography.current.of(
            EditorView.theme({ '&': { fontSize: `${fontSize}px` } })
          ),
          EditorView.theme(
            {
              '&': {
                color: 'var(--text)',
                backgroundColor: 'var(--page)',
                height: '100%',
                direction: 'ltr'
              },
              '.cm-content': {
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                padding: '18px 0',
                minHeight: '320px',
                caretColor: 'var(--accent)'
              },
              '.cm-scroller': { overflow: 'auto', lineHeight: '1.8' },
              '.cm-gutters': {
                color: 'var(--muted)',
                backgroundColor: 'var(--page)',
                borderRight: '1px solid var(--line)'
              },
              '.cm-activeLine, .cm-activeLineGutter': {
                backgroundColor: 'var(--soft)'
              },
              '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
                backgroundColor: '#305a6e80'
              },
              '.cm-cursor': { borderLeftColor: 'var(--accent)' },
              '.cm-panels': {
                backgroundColor: 'var(--surface)',
                color: 'var(--text)'
              },
              '.cm-search input': {
                color: 'var(--text)',
                backgroundColor: 'var(--page)',
                border: '1px solid var(--line)'
              }
            },
            { dark: true }
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callback.current(update.state.doc.toString());
          })
        ]
      })
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
    // A tab owns its own history. Value changes are applied without recreating the editor.
  }, [path]);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      });
  }, [value]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: [
        editable.current.reconfigure(EditorState.readOnly.of(readOnly)),
        typography.current.reconfigure(
          EditorView.theme({ '&': { fontSize: `${fontSize}px` } })
        )
      ]
    });
  }, [readOnly, fontSize]);
  return <div className="editor-host" ref={host} />;
}
export function searchEditor() {
  const element = document.querySelector<HTMLElement>('.cm-editor');
  const view = element ? EditorView.findFromDOM(element) : null;
  if (view) openSearchPanel(view);
}
