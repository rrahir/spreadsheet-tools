// Headless grid rendering: drives the real GridRenderer store with a canvas
// context whose drawing operations are no-ops, so that only the work done by
// the engine to compute what to draw is measured.

const noop = () => {};
const gradient = { addColorStop: noop };

function makeMockContext2D() {
    // Unknown members fall back to a no-op, so newly used canvas APIs don't
    // break the scenarios.
    const fallback = new Proxy({}, { get: (target, key) => (key === Symbol.toPrimitive ? undefined : noop) });
    const ctx = Object.create(fallback);
    Object.assign(ctx, {
        canvas: { width: 0, height: 0 },
        font: "10px sans-serif",
        fillStyle: "#000",
        strokeStyle: "#000",
        lineWidth: 1,
        textAlign: "left",
        textBaseline: "alphabetic",
        globalAlpha: 1,
        save: noop,
        restore: noop,
        beginPath: noop,
        closePath: noop,
        rect: noop,
        roundRect: noop,
        clip: noop,
        fill: noop,
        stroke: noop,
        fillRect: noop,
        strokeRect: noop,
        clearRect: noop,
        fillText: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        quadraticCurveTo: noop,
        bezierCurveTo: noop,
        translate: noop,
        scale: noop,
        rotate: noop,
        setTransform: noop,
        resetTransform: noop,
        setLineDash: noop,
        drawImage: noop,
        createLinearGradient: () => gradient,
        createPattern: () => ({}),
        measureText: (text) => ({
            width: String(text).length * 7,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 2,
            fontBoundingBoxAscent: 9,
            fontBoundingBoxDescent: 3,
        }),
    });
    return ctx;
}

/**
 * Creates a headless grid of `width` x `height` pixels on the model, with
 * `draw()` rendering one frame and `scrollTo()` moving the viewport.
 */
export function makeHeadlessGrid({ stores }, model, { width = 1600, height = 900 } = {}) {
    // used to draw icons (CF icon sets, filters...)
    globalThis.Path2D ??= class Path2D {
        addPath() {}
    };
    const container = new stores.DependencyContainer();
    container.inject(stores.ModelStore, model);
    const rendererStore = container.get(stores.RendererStore);
    container.instantiate(stores.GridRenderer, rendererStore);
    const viewStore = container.get(stores.ViewportsStore);
    viewStore.resizeSheetView({ width, height, gridOffsetX: 0, gridOffsetY: 0 });
    const ctx = makeMockContext2D();
    return {
        container,
        draw() {
            rendererStore.draw({
                ctx,
                dpr: 1,
                thinLineWidth: 0.4,
                viewports: viewStore.viewports,
                ...model.getters.getSelectionState(),
            });
        },
        scrollTo(offsetX, offsetY) {
            viewStore.setViewportOffset({ offsetX, offsetY });
        },
    };
}
