import { test, expect } from '../../../../tests/e2e/fixtures'
import {
  putObject,
  objectExists,
  deleteObject,
  tenantKey,
} from '../testing'

/**
 * Upload slice — direct-S3 roundtrip against the LocalStack/S3Mock
 * service container. Pure infra check: PUT → HEAD → DELETE → HEAD-miss.
 * Verifies the tenant-key convention (`r/{restaurantId}/...`) is the
 * key shape every upload-related spec should use (CLAUDE.md rule 9).
 *
 * Production presign + commit flow is covered by spec files that drive
 * the upload UI (to be added per asset target).
 */

test.describe('@smoke upload storage', () => {
  test('put / head / delete roundtrip on a tenant-prefixed key', async () => {
    const key = tenantKey('r-test-restaurant', 'logo.png')
    expect(key).toBe('r/r-test-restaurant/logo.png')

    await putObject(key, Buffer.from('iedora'))
    expect(await objectExists(key)).toBe(true)

    await deleteObject(key)
    expect(await objectExists(key)).toBe(false)
  })

  test('tenantKey strips leading slashes from the suffix', () => {
    expect(tenantKey('rid', '/banner.jpg')).toBe('r/rid/banner.jpg')
    expect(tenantKey('rid', '//double.jpg')).toBe('r/rid/double.jpg')
    expect(tenantKey('rid', 'category/12/photo.jpg')).toBe(
      'r/rid/category/12/photo.jpg',
    )
  })
})
