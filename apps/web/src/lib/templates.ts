import type { Language } from '@/store/editor-store';

export const STARTER_TEMPLATES: Record<Language, string> = {
  cpp: `#include<bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    return 0;
}`,

  python: `import sys
input = sys.stdin.readline

`,

  java: `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

    }
}`,

  javascript: `const lines = require('fs').readFileSync('/dev/stdin','utf8').split('\\n');
`,
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  cpp: 'C++ 17',
  python: 'Python 3.11',
  java: 'Java 21',
  javascript: 'JavaScript (Node 20)',
};

export const MONACO_LANGUAGE_MAP: Record<Language, string> = {
  cpp: 'cpp',
  python: 'python',
  java: 'java',
  javascript: 'javascript',
};
