# zs-extract

Zippyshare download data extractor


# Overview

This module simplifies extracting download info from a Zippyshare link. Instead of parsing their ever-changing JavaScript for the variables to compute the download URL, this module uses Node's VM functionality to safely emulate a browser in a sandboxed environment, making it much more resilient to changes in the obfuscated download link generation code.


# Usage

```js
import zsExtract from 'zs-extract';

const info = await zsExtract.extract('https://www109.zippyshare.com/v/EXfrFTJo/file.html');

console.log(info); // { download: 'https://www109.zippyshare.com/d/EXfrFTJo/816592/jmmb%20avatar.png', filename: 'jmmb avatar.png' }
```


# Bugs

If you find a bug or have compatibility issues, please open a ticket under issues section for this repository.


# License

Copyright (c) 2019 JrMasterModelBuilder

Licensed under the Mozilla Public License, v. 2.0.

If this license does not work for you, feel free to contact me.
