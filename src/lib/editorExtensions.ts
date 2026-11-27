import { Extension, Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

export const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, '') || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const ResizableImageExtension = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 460,
        parseHTML: (element) =>
          element.getAttribute('width') || element.style.width?.replace('px', '') || 460,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { width: String(attributes.width) };
        },
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align || 'center',
        }),
      },
      rounded: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-rounded') !== 'false',
        renderHTML: (attributes) => ({
          'data-rounded': attributes.rounded === false ? 'false' : 'true',
        }),
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const widthVal = HTMLAttributes.width ? `${HTMLAttributes.width}px` : '460px';
    const alignVal = HTMLAttributes['data-align'] || 'center';
    const isRounded = HTMLAttributes['data-rounded'] !== 'false';

    const marginStyle =
      alignVal === 'center'
        ? 'display: block; margin: 14px auto;'
        : alignVal === 'right'
          ? 'display: block; margin: 14px 0 14px auto;'
          : 'display: block; margin: 14px auto 14px 0;';

    const radiusStyle = isRounded ? 'border-radius: 14px;' : 'border-radius: 4px;';

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style: `width: ${widthVal}; max-width: 100%; height: auto; ${marginStyle} ${radiusStyle}`,
      }),
    ];
  },
});

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr[data-page-break="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'hr',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'fw-page-break',
        'aria-label': 'ตัวแบ่งหน้ากระดาษ',
      }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain()
            .insertContent([{ type: this.name }, { type: 'paragraph' }])
            .run(),
    };
  },
});
