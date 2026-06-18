from django.test import TestCase, Client


class HealthEndpointTests(TestCase):
    def test_health_endpoint_reports_database_and_cache_status(self):
        response = Client().get('/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        payload = response.json()
        self.assertEqual(payload['status'], 'ok')
        self.assertEqual(payload['database'], 'ok')
        self.assertIn(payload['cache'], ['ok', 'unavailable'])
