import { describe, expect, it, vi } from 'vitest'

import {
  detectPinterestPageState,
  fillPinterestForm,
  findPinterestPublishButton,
  isPinterestPublishConfirmed,
} from '../src/adapters/pinterest-dom'

describe('Pinterest DOM adapter', () => {
  it('detects login and CAPTCHA pages', () => {
    document.body.innerHTML = '<input type="password"><button>Log in</button>'
    expect(detectPinterestPageState(document)).toBe('authentication_required')

    document.body.innerHTML = '<main>Complete this CAPTCHA to continue</main>'
    expect(detectPinterestPageState(document)).toBe('captcha_detected')
  })

  it('fills every supported pin field and selects the configured board', () => {
    document.body.innerHTML = `
      <input aria-label="Add your title">
      <textarea aria-label="Tell everyone what your Pin is about"></textarea>
      <input aria-label="Add alt text">
      <input aria-label="Add a destination link">
      <button aria-label="Select board">Choose board</button>
      <div role="option">Aksesori Gadget Pilihan</div>
    `
    const boardTrigger = document.querySelector<HTMLElement>('[aria-label="Select board"]')!
    const boardOption = document.querySelector<HTMLElement>('[role="option"]')!
    const triggerClickSpy = vi.spyOn(boardTrigger, 'click')
    const clickSpy = vi.spyOn(boardOption, 'click')

    const result = fillPinterestForm(document, {
      title: 'Kabel Fast Charging untuk Meja Kerja',
      description: 'Pilihan praktis untuk pengisian daya harian. #affiliate',
      altText: 'Kabel fast charging pada poster aksesori gadget',
      destinationUrl: 'https://s.shopee.co.id/example',
      boardName: 'Aksesori Gadget Pilihan',
    })

    expect(result).toEqual({ success: true, missingFields: [] })
    expect((document.querySelector('[aria-label="Add your title"]') as HTMLInputElement).value).toContain('Kabel')
    expect((document.querySelector('[aria-label="Add a destination link"]') as HTMLInputElement).value).toBe('https://s.shopee.co.id/example')
    expect(triggerClickSpy).not.toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('reports missing required fields instead of clicking speculatively', () => {
    document.body.innerHTML = '<input aria-label="Add your title">'
    expect(fillPinterestForm(document, {
      title: 'Title',
      description: 'Description #affiliate',
      altText: 'Alt text',
      destinationUrl: 'https://s.shopee.co.id/example',
      boardName: 'Board',
    })).toMatchObject({ success: false, missingFields: ['description', 'altText', 'destinationUrl', 'board'] })
  })

  it('finds publish controls and confirms visible success feedback', () => {
    document.body.innerHTML = '<button>Publish</button><div role="status">Your Pin was published</div>'
    expect(findPinterestPublishButton(document)?.textContent).toBe('Publish')
    expect(isPinterestPublishConfirmed(document)).toBe(true)
  })
})
