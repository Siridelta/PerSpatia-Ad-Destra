

// desmos state json
let a = {
    "version": 11,
    "randomSeed": "e5bacb2381b1f334e35ba20b08ad752e",
    "graph": {
        "viewport": {
            "xmin": -10,
            "ymin": -7.447777467843553,
            "xmax": 10,
            "ymax": 7.447777467843553
        },
        "__v12ViewportLatexStash": {
            "xmin": "-10",
            "xmax": "10",
            "ymin": "-7.447777467843553",
            "ymax": "7.447777467843553"
        }
    },
    "expressions": {
        "list": [
            {
                "type": "expression",
                "latex": "y = x ^ 2",
                "id": "1",
                "color": "#004440"
            }
        ]
    },
    "includeFunctionParametersInRandomSeed": true,
    "doNotMigrateMovablePointStyle": true
};
const apiKey = "992e835e9326468b897214ac3c89e04a";
node_output(a, "ab")


---



compatibility with desmos preview node

export/import canvas: 

- use complete state --- with version number

- bug: when import there's problems in node inital dimensions -> hence the 2-layer not visually synced, and unexpected scrollbars

