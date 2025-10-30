

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


我在想。。。。一个很抽象的玩意儿
就是你看这两个场景
在@useCanvasEval-v-usePrevious.ts 里面，我为了对canvasEval的输入进行一个只响应增量式的响应，用了一个usePrevious记录了一个历史版本；但是有时候我在想吧，万一以后canvasEval也能反过来改code呢？（因为现在的controls的上下界步长这些属性是完全由代码决定的，所以会导致那个修改上下界步长的ui实际上没有用，除非能通过这个ui把指令传到eval里面eval里面再反过来修改它上面传入的代码本身）现在controls是一个很独特的状态，它可以由UI层设置，也可以由eval模块设置，所以目前把controls状态放eval模块里了，但是。。。。。这真的好吗？还是说，controls应该也从外界输入，但是也有一个eval自己逆向回去set controls的渠道？
以及在这里也有一个类似的逻辑，@DualLayerCodeEditor.tsx ，它这里输入的是initalText而不是text，这其实也是一个很勉强的办法，因为它本意是想避免逆向set text之后text的变化从上面传下来然后引发CodeEditor再次重新渲染什么的（当然这个担忧其实没有必要，因为其实字符串之间只要内容相等就能通过全等比较===，但是是这个场景启发了我应该做下面的事情）
所以这时候假如没有这个场景里特有的字符串全等不会触发重新渲染的比较幸运的机制，那么该怎么办？传入text - 反写text，传入code - 反写code，传入controls - 反写controls，同时都避免二次计算（that is，”我自己主动发起的更新我内部肯定早准备好了，不需要react再按照它的原则上游更新必触发下游更新的原则再更新我一次了“），这三个场景其实本质都一样，我也想到一个不知道算好不好的解法：对于每一块想要能被反向回写且避免二次更新的输入组分，像useCanvasEval-v-usePrevious一样维护一个previous state（上次记录），但是再稍稍改造一下，如果上次更新时做出了应等效于反写的操作，那么这个历史值就应该也变成新值，比如如果是输入了controls但是我算完之后自己也得更新controls，那么记录的历史里面就应该是新的controls了，这样向上游反写完之后上游更新下来的时候跟历史缓存记录比对的时候，会发现，诶，历史记录也是新值，不用修改。当然这样会让我们的概念在语义上失真了，历史不是真的历史，我们”岁月史书“了，而且另外一方面我们原则上也不能直接变动历史输入值，因为这样相当于直接对它内部进行mutate，会导致。。。。。如果这个输入对象体在输入我们这边之前在上游里也被其他东西依赖着，我们改它了，会导致很多出乎意料的影响。。。。。。所以或许更合理的做法是维护一个”第三版本“，不知道起什么名好，期望值？expectation？
以上，就是我对这个问题的一些比较个人的想法以及一个把它抽象化并设计的一个通用的解决方案。你觉得如何？