import { useReveal } from "../lib/reveal.js";

/**
 * Reveal — an element that rises into view as it is scrolled to.
 *
 * The observer and the stagger helper live in lib/reveal.js, which holds no
 * JSX; this is the thin component around them, in components/ where the rest
 * of the JSX lives.
 *
 * `as` matters more than it looks. Several of these sit directly inside a CSS
 * grid, and wrapping a grid item in an extra div makes the WRAPPER the grid
 * item and collapses the layout. Rendering AS the card — taking over its
 * classes and styles — keeps the DOM shape identical to before the animation
 * existed, so nothing about the layout depends on the effect being there.
 *
 * `delay` staggers siblings; see stagger() for the ceiling.
 */
export function Reveal({ as: Tag = "div", delay = 0, className = "", style, children, ...rest }) {
  const ref = useReveal();
  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${className}`.trim()}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
