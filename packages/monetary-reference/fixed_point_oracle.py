"""Fraction-based differential oracle for the founder-approved quantized monetary rules.

Reads synthetic vectors from stdin. No wallet, network, database or settlement access.
This computational cross-check is not an external review or release approval.
"""
import json
import sys
from fractions import Fraction as F

TOKEN = 10**18


def unpack(value):
    return F(int(value['numerator']), int(value['denominator']))


def pack(value):
    return {'numerator': str(value.numerator), 'denominator': str(value.denominator)}


def ceiling(value):
    return -(-value.numerator // value.denominator)


def calculate(vector):
    state = vector['state']
    supply = int(state['supplyAtoms'])
    reserve = int(state['reserveMasterUnits'])
    price = unpack(state['priceUsd36'])
    rounding = unpack(state['roundingUsd36'])
    value_per_unit = F(int(vector['value']), 10**state['masterDecimals'])
    fee_total = company_total = holder_total = payout_total = 0
    minted_total = 0
    allocations = []
    residual = F(0)
    requests = sorted(vector['requests'], key=lambda item: item['id'])
    remaining = supply - sum(int(item['tokenAtoms']) for item in requests) if vector['kind'] == 'REDEMPTION' else None
    for request in requests:
        if vector['kind'] == 'PURCHASE':
            gross = int(request['masterUnits'])
            fee = ceiling(F(gross, 100))
            company = fee if supply == 0 else fee // 5
            holder = fee - company
            holder_rounding = F(0)
            if supply:
                exact_price = price + holder * value_per_unit * TOKEN / supply
                price = F(exact_price.numerator // exact_price.denominator)
                holder_rounding = (exact_price-price)*supply/TOKEN
            net = (gross - fee) * value_per_unit
            exact = net * TOKEN / price
            minted = exact.numerator // exact.denominator
            mint_rounding = net - F(minted, TOKEN) * price
            remainder = mint_rounding + holder_rounding
            supply += minted
            reserve += gross - company
            minted_total += minted
            allocations.append({'id': request['id'], 'grossMasterUnits': str(gross), 'feeMasterUnits': str(fee),
                'companyMasterUnits': str(company), 'holderMasterUnits': str(holder),
                'priceUsd36': pack(price), 'mintedAtoms': str(minted), 'roundingUsd36': pack(remainder),
                'mintRoundingUsd36': pack(mint_rounding), 'holderPriceRoundingUsd36': pack(holder_rounding)})
        else:
            atoms = int(request['tokenAtoms'])
            gross_value = F(atoms, TOKEN) * price
            gross = gross_value / value_per_unit
            fee = ceiling(gross / 100)
            company = fee if remaining == 0 else fee // 5
            holder = fee - company
            exact_payout = gross - fee
            payout = exact_payout.numerator // exact_payout.denominator
            remainder = (exact_payout - payout) * value_per_unit
            payout_total += payout
            allocations.append({'id': request['id'], 'burnedAtoms': str(atoms), 'grossUsd36': pack(gross_value),
                'feeMasterUnits': str(fee), 'companyMasterUnits': str(company), 'holderMasterUnits': str(holder),
                'payoutMasterUnits': str(payout), 'roundingUsd36': pack(remainder)})
        residual += remainder
        fee_total += fee
        company_total += company
        holder_total += holder
    if vector['kind'] == 'REDEMPTION':
        supply = remaining
        reserve -= payout_total + company_total
        if remaining:
            exact_price = price + holder_total * value_per_unit * TOKEN / remaining
            price = F(exact_price.numerator // exact_price.denominator)
            residual += (exact_price-price)*remaining/TOKEN
    phase = 'ACTIVE' if supply else 'ZERO_SUPPLY_PENDING'
    next_state = dict(state, supplyAtoms=str(supply), reserveMasterUnits=str(reserve), priceUsd36=pack(price),
        roundingUsd36=pack(rounding + residual), phase=phase)
    return {'feeMasterUnits': str(fee_total), 'companyMasterUnits': str(company_total),
        'holderMasterUnits': str(holder_total), 'roundingUsd36': pack(residual), 'allocations': allocations, 'next': next_state}


if __name__ == '__main__':
    print(json.dumps([calculate(vector) for vector in json.load(sys.stdin)], separators=(',', ':')))
