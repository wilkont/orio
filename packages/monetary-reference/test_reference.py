import unittest
from fractions import Fraction as F
from reference import purchase, redeem


class MonetarySpecificationTests(unittest.TestCase):
    def test_purchase_appreciates_before_mint(self):
        r = purchase(100, 1, 100)
        self.assertEqual((r.fee, r.company, r.holders), (1, F(1, 5), F(4, 5)))
        self.assertEqual(r.price, F(126, 125))
        self.assertEqual(r.minted * r.price, 99)
        self.assertEqual(r.supply * r.price + r.company, 200)

    def test_redemption_excludes_burned_tokens(self):
        r = redeem(100, 1, 50)
        self.assertEqual(r.price, F(126, 125))
        self.assertEqual(r.payout, F(99, 2))
        self.assertEqual(r.supply * r.price + r.company + r.payout, 100)

    def test_complete_redemption(self):
        r = redeem(100, 1, 100)
        self.assertEqual((r.supply, r.price, r.company, r.holders, r.payout), (0, 1, 1, 0, 99))

    def test_zero_holder_and_retained_reopening_reference(self):
        first = purchase(0, 1, 1000)
        self.assertEqual((first.company, first.holders, first.minted), (10, 0, 990))
        reopened = purchase(0, F(5, 4), 125)
        self.assertEqual((reopened.price, reopened.company, reopened.minted), (F(5, 4), F(5, 4), 99))

    def test_conservation_over_many_sizes(self):
        for s in range(1, 101):
            p = F(137, 91)
            for d in (F(1, 10**18), 1, 1000000):
                r = purchase(s, p, d)
                self.assertEqual(r.supply*r.price + r.company, s*p+d)
                self.assertEqual(r.price-p, r.holders/s)
            for q in (F(1, 10**18), F(s)-F(1, 10**18), F(s)):
                r = redeem(s, p, q)
                liability = r.supply*r.price if r.supply else 0
                self.assertEqual(liability+r.company+r.payout, s*p)

    def test_policy_and_input_rejections(self):
        for args in ((-1, 1, 1), (1, 0, 1), (1, 1, 0)):
            with self.assertRaises(ValueError):
                purchase(*args)
        for args in ((1, 1, 2), (0, 1, 1), (1, -1, 1), (1, 1, 0)):
            with self.assertRaises(ValueError):
                redeem(*args)
        for bad in (1.0, True, '1'):
            with self.assertRaises(TypeError):
                purchase(1, 1, bad)


if __name__ == '__main__':
    unittest.main()
