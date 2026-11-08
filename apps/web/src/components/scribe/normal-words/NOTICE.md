# Normal word lists

Scribe uses these two packed lists to warn when a word fix also changes a normal word or first name.
Rebuild them with `node scripts/build-normal-words.ts <folder with the unzipped SSA yobYYYY.txt files>`.

## common-words.txt.gz

38756 words from the English Speller Database (ESDB, also known as SCOWL), size 35, US spelling,
made at https://app.aspell.net/create. The license of the list, copied as the list states it:

```text
Custom wordlist generated from https://app.aspell.net/create using
the English Speller Database (ESDB) with parameters:
  Size: 35 (small)
  Spelling: US
  Variant Level: 1 *default*
  Special: <none>
  Diacritics: strip

https://wordlist.aspell.net

ESDB Git Revision: Wed Jun 24 14:30:42 2026 -0400 [1e5b7d3]
App Git Revision: Thu Jun 25 15:43:51 2026 -0400 [156fb4e]

Copyright 2000-2026 by Kevin Atkinson

Permission to use, copy, modify, distribute, and sell any part of the English
Speller Database (ESDB, previously known as SCOWLv2), or word lists
created from it, is hereby granted without fee, provided that the above
copyright notice appears in all copies and that both the above copyright
notice and this notice appear in supporting documentation.  Kevin Atkinson
makes no representations about the suitability of this database for any
purpose.  It is provided "as is" without express or implied warranty.

ESDB is derived from many sources, most of which are in the Public Domain.
Data from the Corpus of Contemporary American English (COCA) was also used.

All data from COCA comes from 3-gram data that is not freely available;
however, the usage is within the rights given by the NDA that was signed when
purchasing the data.  More information on COCA is available at
https://www.english-corpora.org/coca/.

The primary source of words for ESDB comes from 12dicts and ENABLE2K.  Both
are in the Public Domain, but Alan Beale <biljir@pobox.com> deserves special
credit as he is the author of 12dicts and a major contributor to ENABLE2K.  In
addition, he gave me an incredible amount of feedback and created a number of
special lists in order to help improve the overall quality of ESDB.
```

## first-names.txt.gz

3836 first names (not already in the word list) with 5000 or more US births since 1880.
They come from the national baby names data of the Social Security Administration (SSA):
https://www.ssa.gov/oact/babynames/limits.html. That page states no reuse terms.
The SSA states at https://www.ssa.gov/policy/accessibility.html that the work of its staff is in the
public domain and not protected by copyright. Works of US federal government employees are also
public domain by law (17 U.S.C. 105).
