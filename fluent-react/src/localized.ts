import {
  Fragment,
  ReactElement,
  ReactNode,
  cloneElement,
  createElement,
  isValidElement,
  useContext
} from "react";
import voidElementTags from "../vendor/voidElementTags.js";
import { FluentContext } from "./context.js";
import { FluentVariable } from "@fluent/bundle";

// Match the opening angle bracket (<) in HTML tags, and HTML entities like
// &amp;, &#0038;, &#x0026;.
const reMarkup = /<|&#?\w+;/;

export interface LocalizedProps {
  id: string;
  attrs?: Record<string, boolean>;
  children?: ReactNode | Array<ReactNode>;
  vars?: Record<string, FluentVariable>;
  elems?: Record<string, ReactElement>;
}
/*
 * The `Localized` class renders its child with translated props and children.
 *
 *     <Localized id="hello-world">
 *         <p>{'Hello, world!'}</p>
 *     </Localized>
 *
 * The `id` prop should be the unique identifier of the translation.  Any
 * attributes found in the translation will be applied to the wrapped element.
 *
 * Arguments to the translation can be passed as `$`-prefixed props on
 * `Localized`.
 *
 *     <Localized id="hello-world" $username={name}>
 *         <p>{'Hello, { $username }!'}</p>
 *     </Localized>
 *
 *  It's recommended that the contents of the wrapped component be a string
 *  expression.  The string will be used as the ultimate fallback if no
 *  translation is available.  It also makes it easy to grep for strings in the
 *  source code.
 */
export function Localized(props: LocalizedProps): ReactElement {
  const { id, attrs, vars, elems, children } = props;
  const l10n = useContext(FluentContext);
  let child: ReactNode | null;

  // Validate that the child element isn't an array that contains multiple
  // elements.
  if (Array.isArray(children)) {
    if (children.length > 1) {
      throw new Error("<Localized/> expected to receive a single " +
        "React node child");
    }

    // If it's an array with zero or one element, we can directly get the first
    // one.
    child = children[0];
  } else {
    child = children ?? null;
  }

  if (!l10n) {
    throw new Error(
      "The <Localized /> component was not properly wrapped in a "
        + "<LocalizationProvider />."
    );
  }

  const bundle = l10n.getBundle(id);

  if (bundle === null) {
    if (id === undefined) {
      l10n.reportError(
        new Error("No id was provided for a <Localized /> component.")
      );
    } else {
      if (l10n.areBundlesEmpty()) {
        l10n.reportError(
          new Error(
            "A <Localized /> component was rendered when no localization "
              + "bundles are present."
          )
        );
      } else {
        l10n.reportError(
          new Error(
            `The id "${id}" did not match any messages in the localization `
              + "bundles."
          )
        );
      }
    }
    // Use the wrapped component as fallback.
    return createElement(Fragment, null, child);
  }

  // l10n.getBundle makes the bundle.hasMessage check which ensures that
  // bundle.getMessage returns an existing message.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const msg = bundle.getMessage(id)!;
  let errors: Array<Error> = [];

  // Check if the child inside <Localized> is a valid element -- if not, then
  // it's either null or a simple fallback string. No need to localize the
  // attributes.
  if (!isValidElement(child)) {
    if (msg.value) {
      // Replace the fallback string with the message value;
      let value = bundle.formatPattern(msg.value, vars, errors);
      for (let error of errors) {
        l10n.reportError(error);
      }
      return createElement(Fragment, null, value);
    }

    return createElement(Fragment, null, child);
  }

  let localizedProps: Record<string, string> | undefined;

  // The default is to forbid all message attributes. If the attrs prop exists
  // on the Localized instance, only set message attributes which have been
  // explicitly allowed by the developer.
  if (attrs && msg.attributes) {
    localizedProps = {};
    errors = [];
    for (const [name, allowed] of Object.entries(attrs)) {
      if (allowed && name in msg.attributes) {
        localizedProps[name] = bundle.formatPattern(
          msg.attributes[name], vars, errors);
      }
    }
    for (let error of errors) {
      l10n.reportError(error);
    }
  }

  // If the wrapped component is a known void element, explicitly dismiss the
  // message value and do not pass it to cloneElement in order to avoid the
  // "void element tags must neither have `children` nor use
  // `dangerouslySetInnerHTML`" error.
  if (typeof child.type === "string" && child.type in voidElementTags) {
    return cloneElement(child, localizedProps);
  }

  // If the message has a null value, we're only interested in its attributes.
  // Do not pass the null value to cloneElement as it would nuke all children
  // of the wrapped component.
  if (msg.value === null) {
    return cloneElement(child, localizedProps);
  }

  errors = [];
  const messageValue = bundle.formatPattern(msg.value, vars, errors);
  for (let error of errors) {
    l10n.reportError(error);
  }

  // If the message value doesn't contain any markup nor any HTML entities,
  // insert it as the only child of the wrapped component.
  if (!reMarkup.test(messageValue) || l10n.parseMarkup === null) {
    return cloneElement(child, localizedProps, messageValue);
  }

  let elemsLower: Record<string, ReactElement>;
  if (elems) {
    elemsLower = {};
    for (let [name, elem] of Object.entries(elems)) {
      elemsLower[name.toLowerCase()] = elem;
    }
  }


  // If the message contains markup, parse it and try to match the children
  // found in the translation with the props passed to this Localized.
  const translationNodes = l10n.parseMarkup(messageValue);
  const translatedChildren = translationNodes.map(childNode => {
    if (childNode.nodeName === "#text") {
      return childNode.textContent;
    }

    const childName = childNode.nodeName.toLowerCase();

    // If the child is not expected just take its textContent.
    if (
      !elemsLower ||
      !Object.prototype.hasOwnProperty.call(elemsLower, childName)
    ) {
      return childNode.textContent;
    }

    const sourceChild = elemsLower[childName];

    // Ignore elems which are not valid React elements.
    if (!isValidElement(sourceChild)) {
      return childNode.textContent;
    }

    // If the element passed in the elems prop is a known void element,
    // explicitly dismiss any textContent which might have accidentally been
    // defined in the translation to prevent the "void element tags must not
    // have children" error.
    if (typeof sourceChild.type === "string"
      && sourceChild.type in voidElementTags) {
      return sourceChild;
    }

    // TODO Protect contents of elements wrapped in <Localized>
    // https://github.com/projectfluent/fluent.js/issues/184
    // TODO  Control localizable attributes on elements passed as props
    // https://github.com/projectfluent/fluent.js/issues/185
    return cloneElement(sourceChild, undefined, childNode.textContent);
  });

  return cloneElement(child, localizedProps, ...translatedChildren);
}

export default Localized;
