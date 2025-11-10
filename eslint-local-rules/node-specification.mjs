function checkNodeSpecVersion(node, context) {
    const [property] = node.value.properties.filter(
        (property) =>
            property.type === "Property" && property.key.name === "specVersion"
    );
    if (!property) {
        context.report({
            node,
            message: `Node specification must contain a specVersion field.`,
        });
    } else if (
        property.value.type !== "Literal" ||
        !Number.isInteger(property.value.value) ||
        property.computed !== false ||
        property.method !== false ||
        property.shorthand !== false ||
        property.kind !== "init"
    ) {
        context.report({
            node,
            message: `Node specification version should be a positive integer.`,
        });
    }
}

function checkNodeAdditionalConnectorsField(node, context) {
    const [property] = node.value.properties.filter(
        (property) =>
            property.type === "Property" &&
            property.key.name === "additionalConnectors"
    );
    if (property) {
        if (
            property.value.type !== "ArrayExpression" ||
            property.computed !== false ||
            property.method !== false ||
            property.shorthand !== false ||
            property.kind !== "init"
        ) {
            context.report({
                node,
                message: `If node output 'additionalConnectors' field is specified, it should be an array.`,
            });
        } else if (!property.value.elements.length) {
            context.report({
                node,
                message: `If node output 'additionalConnectors' array is specified, it should be non-empty.`,
            });
        }
    }
}

function checkNodeSpecificationFields(node, context) {
    if (
        node.parent.type === "ClassBody" &&
        node?.parent?.parent?.superClass?.name === "Node" &&
        node.key.name === "specification"
    ) {
        checkNodeSpecVersion(node, context);
        checkNodeAdditionalConnectorsField(node, context);
    }
}

export default {
    meta: {
        docs: {
            description: "Check node specification properties",
            recommended: true,
        },
        fixable: "code",
    },
    create(context) {
        return {
            PropertyDefinition: (node) => {
                checkNodeSpecificationFields(node, context);
            },
        };
    },
};
