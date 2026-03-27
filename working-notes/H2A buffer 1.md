

---

inner state

output state

radiuslog

wheel rate 做成常数

偏航强度+

---

呃呃

- 可以把它拆成inner camera state 和outer camera state吗，目前的偏航不够在数学上准确，我想能否在内部维护未偏置的 theta, phi，和一个由panVelocity.current直接决定的 偏置值，然后对外输出 output camera state，把偏置值应用在原来的角度上并保持 theta + phi 的表示，这样下游就不用做这个把偏置应用在原有角度的算法

- 然后radius直接乘除还是有点不太放心，你可以维护一个radiusLog吗，然后radiusLog线性变化，radius = exp(radiusLog)

- wheel rate 能否做成常数，也就是 radius Log 的变化速率，然后也写大一点

- 我感觉不到偏航，不知道是因为偏航强度太小还是因为偏航机制没有正确发挥作用，如果偏航强度太小你稍微写大一点