import { describe, expect, it } from 'vitest'

import { EMAIL_PATTERN, isValidCode, isValidNickname, isValidPassword } from './accountRules'

describe('isValidNickname', () => {
  it('2~16자의 한글·영문·숫자를 받는다', () => {
    expect(isValidNickname('코다')).toBe(true)
    expect(isValidNickname('ab')).toBe(true)
    expect(isValidNickname('코다리1234567890123')).toBe(true) // 16자
  })

  it('경계를 벗어나면 거부한다', () => {
    expect(isValidNickname('가')).toBe(false) // 1자
    expect(isValidNickname('코다리12345678901234')).toBe(false) // 17자
  })

  it('허용 문자 밖을 거부한다', () => {
    // 공백·기호·이모지는 '한글·영문·숫자만'에 들어가지 않는다 (계정 규칙).
    expect(isValidNickname('코 다')).toBe(false)
    expect(isValidNickname('코다!')).toBe(false)
    expect(isValidNickname('코다🙂')).toBe(false)
    // 자모 분리(ㄱ)는 완성형 글자가 아니다. 서버 정규식도 가-힣만 받는다.
    expect(isValidNickname('ㄱㄴ')).toBe(false)
  })
})

describe('닉네임 글자 범위', () => {
  it('가-힣의 양 끝 글자를 받는다 (범위 끝이 틀리면 실제 이름이 막힌다)', () => {
    expect(isValidNickname('가가')).toBe(true)
    expect(isValidNickname('힣힣')).toBe(true)
  })

  it('반각·조합용 자모를 거부한다 (서버는 완성형만 받는다)', () => {
    expect(isValidNickname('ﾡﾡ')).toBe(false) // 반각 ㄱ
    expect(isValidNickname('ᄀᄀ')).toBe(false) // 조합용 ㄱ
  })
})

describe('EMAIL_PATTERN', () => {
  it('서버가 가입시켜 주는 모양을 받는다 (막으면 그 계정 주인이 가입 폼을 못 쓴다)', () => {
    expect(EMAIL_PATTERN.test('user!x@example.com')).toBe(true)
    expect(EMAIL_PATTERN.test('a@b.c')).toBe(true)
  })

  it('이메일이 아닌 것을 거부한다', () => {
    expect(EMAIL_PATTERN.test('foo')).toBe(false)
    expect(EMAIL_PATTERN.test('a@b')).toBe(false)
    expect(EMAIL_PATTERN.test('a@@b.c')).toBe(false)
    expect(EMAIL_PATTERN.test('a b@c.com')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('10~20자이고 네 종류를 다 넣으면 받는다', () => {
    expect(isValidPassword('Codari!tes1')).toBe(true) // 11자
    expect(isValidPassword('Ab3!567890')).toBe(true) // 10자
    expect(isValidPassword('Ab3!5678901234567890')).toBe(true) // 20자
  })

  it('길이 경계를 지킨다', () => {
    expect(isValidPassword('Ab3!56789')).toBe(false) // 9자
    expect(isValidPassword('Ab3!56789012345678901')).toBe(false) // 21자
  })

  it('종류가 하나라도 빠지면 거부한다', () => {
    expect(isValidPassword('codari!test1')).toBe(false) // 대문자 없음
    expect(isValidPassword('CODARI!TEST1')).toBe(false) // 소문자 없음
    expect(isValidPassword('Codari!test')).toBe(false) // 숫자 없음
    expect(isValidPassword('Codaritest12')).toBe(false) // 특수문자 없음
  })

  it('특수문자 범위의 네 끝(/ : ` ~)을 모두 받는다 (범위 오타를 잡는다)', () => {
    expect(isValidPassword('Ab3/567890')).toBe(true)
    expect(isValidPassword('Ab3:567890')).toBe(true)
    expect(isValidPassword('Ab3`567890')).toBe(true)
    expect(isValidPassword('Ab3~567890')).toBe(true)
  })

  it('ASCII 밖 기호는 특수문자로 세지 않는다 (서버는 ASCII 기호만 센다)', () => {
    expect(isValidPassword('Ab3·567890')).toBe(false)
    expect(isValidPassword('Ab3※567890')).toBe(false)
  })

  it('공백을 특수문자로 세지 않는다', () => {
    // 서버는 특수문자를 ASCII 기호(\p{Punct})로 센다. 공백은 거기 없다.
    expect(isValidPassword('Codari test1')).toBe(false)
  })
})

describe('isValidCode', () => {
  it('숫자 6자리만 받는다', () => {
    expect(isValidCode('123456')).toBe(true)
    expect(isValidCode('12345')).toBe(false)
    expect(isValidCode('1234567')).toBe(false)
    expect(isValidCode('12345a')).toBe(false)
    expect(isValidCode('')).toBe(false)
    expect(isValidCode(' 123456 ')).toBe(false)
  })
})
