/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const expect = require("chai").expect;
const sh = require("../index");

/**
 * Feeds chunks to the lexer and concatenates contexts.
 * Tests that the lexer ends in a valid end state and
 * appends "_ERR_" as an end state if not.
 */
function tokens(...chunks) {
    let lexer = sh.makeLexer();
    let out = [];
    for (let i = 0, n = chunks.length; i < n; ++i) {
        out.push(lexer(chunks[i])[0] || '_');
    }
    try {
        lexer(null);
    } catch (e) {
        out.push('_ERR_');
    }
    return out.join(',');
}

// Unwrap an ShFragment, failing if the result is not one.
function uw(x) {
    if (x instanceof sh.ShFragment) {
        return String(x);
    }
    throw new Error('Expected ShFragment not ' + JSON.stringify(x));
}

// Run a test multiply  to exercise the memoizing code.
function runShTest(golden, test) {
    for (let i = 3; --i >= 0;) {
        if (golden === '_ERR_') {
            expect(test).to.throw();
        } else {
            let result = uw(test());
            expect(golden).to.equal(result);
        }
    }
}

describe('sh template tags', () => {
    describe('lexer', () => {
        it('empty string', () => {
            expect('_').to.equal(tokens(''));
        });
        it('word', () => {
            expect('_').to.equal(tokens('foo'));
        });
        it('words', () => {
            expect('_').to.equal(tokens('foo bar baz'));
        });
        it('words split', () => {
            expect('_,_,_').to.equal(tokens('foo bar', ' ', 'baz'));
        });
        it('parens', () => {
            expect('_').to.equal(tokens('foo (bar) baz'));
        });
        it('parens split', () => {
            expect('_,_,(,_,_,_').to.equal(
              tokens('foo', ', ', '(bar', ')', ' ', 'baz'));
        });
        it('parens hanging split', () => {
            expect('_,_,(,(,(,_ERR_').to.equal(
              tokens('foo', ', ', '(bar', ' ', 'baz'));
        });
        it('quotes embed subshell', () => {
            expect('",$(,_').to.equal(
              tokens(' "foo', '$(bar ', ' baz)" boo'));
        });
        it('quotes embed arithshell', () => {
            expect('",$((,$((,",_').to.equal(
              tokens(' "foo', '$((bar ', '(far)', ' baz))', 'q" boo'));
        });
        it('quotes embed backticks', () => {
            expect('",`,`,",_').to.equal(
              tokens(' "foo', '`bar ', '(far)', ' baz`', 'q" boo'));
        });
        it('escape affects subshell', () => {
            expect('",",",",_').to.equal(
              tokens(' "foo', '\\$((bar ', '(far)', ' baz))', 'q" boo'));
        });
        it('single quotes do not embed', () => {
            expect("',',',',_").to.equal(
              tokens(' \' $(',
                     'foo) $((',
                     'bar))',
                     ' `',
                     ' ` # \' '));
        });
        it('unterminated comment', () => {
            expect("#,_ERR_").to.equal(
              tokens(' #foo'));

        });
        it('terminated comment', () => {
            expect("_").to.equal(
              tokens(' #foo\n'));
        });
        it('terminated comment split', () => {
            expect("#,_").to.equal(
              tokens(' #foo', 'bar\n'));
        });
        it('arithshell', () => {
            expect('_,$((,$((,_,_').to.equal(
              tokens('foo', ' $((bar ', '(far)', ' baz))', ' boo'));
        });
        it('backticks', () => {
            expect('_,`,`,_,_').to.equal(
              tokens('foo', '`bar ', '(far)', ' baz`', ' boo'));
        });
        it('subshell paren disambiguation', () => {
            expect('$(,(,$(,",_,_').to.equal(tokens(
              'echo "$(foo ', ' | (bar ', ' baz)', ' boo)', 'far" | ', ''));
        });
        it('hash not after space', () => {
            expect('_,_').to.equal(
              tokens('echo foo#', ''));
        });
        it('hash after space', () => {
            expect('#,#,_ERR_').to.equal(
              tokens('echo foo #', ''));
        });
        it('hash concatenation hazard', () => {
            expect(() => tokens('#foo')).to.throw();
        });
        it('intermediate concatenation hazard', () => {
            expect(() => tokens('echo foo', '#bar')).to.throw();
        });
        it('escaped intermediate concatenation hazard', () => {
            expect('_,_').to.equal(tokens(
              'echo foo', '\\#bar'));
        });
        it('simple heredoc', () => {
            expect('_').to.equal(tokens('cat <<EOF\nFoo bar\nEOF\n'))
        });
        it('heredoc hazard', () => {
            // Concatenation hazard when no eol at end
            expect('<<EOF,_ERR_').to.equal(tokens('cat <<EOF\nFoo bar\nEOF'))
        });
        it('split heredoc', () => {
            expect('<<EOF,_').to.equal(tokens('cat <<EOF\nFoo', ' bar\nEOF\n'));
        });
        it('split heredoc sp', () => {
            expect('<<EOF,_').to.equal(tokens('cat << EOF\nFoo', ' bar\nEOF\n'));
        });
        it('split heredoc-', () => {
            expect('<<-EOF,_').to.equal(tokens('cat <<-EOF\nFoo', ' bar\nEOF\n'));
        });
        it('bad heredoc label', () => {
            expect(() => tokens('cat << "EOF"\nFoo bar\nEOF;')).to.throw();
        });
        it('missing heredoc label', () => {
            expect(() => tokens('cat <<', '\nfoo bar\n', ';')).to.throw();
        });
    });

    const s = "a\"\'\n\\$b";
    const n = 1234;
    const f = new sh.ShFragment(' frag ');
    describe('template tag', () => {
        it('string in top level', () => {
            runShTest(`echo 'a"'"'"'\n\\$b'`, () => sh`echo ${s}`);
        });
        it('number in top level', () => {
            runShTest(`echo '1234'`, () => sh`echo ${n}`);
        });
        it('fragment in top level', () => {
            runShTest(`echo  frag `, () => sh`echo ${f}`);
        });
        it('string in dq', () => {
            runShTest(`echo "a\\"'\n\\\\\\$b"`, () => sh`echo "${s}"`);
        });
        it('number in dq', () => {
            runShTest(`echo "1234"`, () => sh`echo "${n}"`);
        });
        it('fragment in dq', () => {
            runShTest(`echo " frag "`, () => sh`echo "${f}"`);
        });
        it('string in sq', () => {
            runShTest(`echo 'a"'"'"'\n\\$b'`, () => sh`echo '${s}'`);
        });
        it('number in sq', () => {
            runShTest(`echo '1234'`, () => sh`echo '${n}'`);
        });
        it('fragment in sq', () => {
            runShTest(`echo ' frag '`, () => sh`echo '${f}'`);
        });
        it('string in embed', () => {
            runShTest(`echo $(echo 'a"'"'"'\n\\$b')`,
                      () => sh`echo $(echo ${s})`);
        });
        it('number in embed', () => {
            runShTest(`echo $(echo '1234')`,
                      () => sh`echo $(echo ${n})`);
        });
        it('fragment in embed', () => {
            runShTest(`echo $(echo  frag )`,
                      () => sh`echo $(echo ${f})`);
        });
        it('hash ambig string', () => {
            runShTest(`_ERR_`, () => sh`echo foo${s}#bar`);
        });
        it('hash ambig fragment', () => {
            runShTest(`_ERR_`, () => sh`echo foo${f}#bar`);
        });
        it('heredoc string', () => {
            runShTest("\ncat <<EOF\na\"\'\n\\$b\nEOF\n", () => sh`
cat <<EOF
${s}
EOF
`);
        });
        it('heredoc number', () => {
            runShTest("\ncat <<EOF\n1234\nEOF\n", () => sh`
cat <<EOF
${n}
EOF
`);
        });
        it('heredoc fragment', () => {
            runShTest("\ncat <<EOF\n frag \nEOF\n", () => sh`
cat <<EOF
${f}
EOF
`);
        });
        it('heredoc sneaky', () => {
            runShTest(`
cat <<EOF_ZQHNfpzxDMLfdgCg8NUgxceUCSQiISNU1zQuqzI6uzs
EOF
rm -rf /
cat <<EOF
EOF_ZQHNfpzxDMLfdgCg8NUgxceUCSQiISNU1zQuqzI6uzs
`,

                      () => sh`
cat <<EOF
${"EOF\nrm -rf /\ncat <<EOF"}
EOF
`);
        });
    });
});
