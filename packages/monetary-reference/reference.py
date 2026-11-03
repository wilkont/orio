"""Exact rational specification oracle, not an executable settlement engine.

No quantization, reserve eligibility, or zero-supply policy is implied here.
Amounts are abstract USD and ORIO units represented by Fraction or integers.
"""
from dataclasses import dataclass
from fractions import Fraction as F


def amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, F)):
        raise TypeError('Only integer or Fraction monetary inputs are accepted')
    return F(value)


@dataclass(frozen=True)
class Quote:
    supply: F
    price: F | None
    fee: F
    company: F
    holders: F
    minted: F = F(0)
    payout: F = F(0)


def purchase(supply, price, deposit):
    s, p, d = map(amount, (supply, price, deposit))
    if s <= 0:
        raise ValueError('Zero-supply issuance requires an approved bootstrap policy')
    if p <= 0 or d <= 0:
        raise ValueError('Price and deposit must be positive')
    fee = d / 100
    company = fee / 5
    holders = fee - company
    new_price = p + holders / s
    minted = (d - fee) / new_price
    return Quote(s + minted, new_price, fee, company, holders, minted=minted)


def redeem(supply, price, quantity):
    s, p, q = map(amount, (supply, price, quantity))
    if s <= 0 or p <= 0 or q <= 0 or q > s:
        raise ValueError('Invalid redemption')
    gross = q * p
    fee = gross / 100
    remaining = s - q
    company = fee / 5 if remaining else fee
    holders = fee - company
    new_price = p + holders / remaining if remaining else None
    return Quote(remaining, new_price, fee, company, holders, payout=gross-fee)
