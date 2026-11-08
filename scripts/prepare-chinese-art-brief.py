#!/usr/bin/env python3
"""Rebuild the full modern illustration brief; never generates images or changes placements."""
import json
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/chinese-sky/art'
def main():
    catalog = json.loads((ROOT / 'assets/chinese-sky/catalog.json').read_text())
    config = json.loads((ROOT / 'assets/chinese-sky/art/rigid-placements.json').read_text())
    originals = [x for x in config['images'] if not x['imageId'].startswith('asterism-')]
    covered = {target.split(':')[-1] for x in originals if x.get('kind') == 'asterisms' for target in x['targetIds']}
    subjects = dict(line.split('|', 1) for line in (OUT / 'subjects.txt').read_text().splitlines() if line.strip())
    entries, audit = [], []
    for a in catalog['asterisms']:
        count = len(a['primaryMemberHips']) + len(a['primaryMemberObjectIds'])
        audit.append({'id':a['id'], 'zh':a['zh'], 'primaryMembers':count, 'membershipState':a['primaryMemberStatus']['state'], 'declaredPrimaryCount':a['declaredPrimaryCount'], 'requiresVisualExtentFloor':count == 1, 'catalogRadiusDegrees':a['radius']})
        if a['id'] in covered: continue
        special = a['id'] in {'047','070','104','105','122','129','169','188','190','194','195','196','197','198','203','211','223','248','257','301'}
        southern = a['groupId'] == 'southern'
        caution = '现代星名意象，不是古代星官原画复原；图中物件数量及局部结构不代表恒星数量或一一对应。'
        if special: caution += '采用克制的象征物，不作身体、暴力或神祇形貌的写实断言。'
        if southern: caution += '南方新增星官不冒充上古三垣二十八宿原有图像。'
        entries.append({'artworkId':'asterism-'+a['id'], 'sourcePNG':'assets/chinese-sky/art/asterism-'+a['id']+'.png', 'targetIds':[a['targetId']], 'groupId':a['groupId'], 'zh':a['zh'], 'sourceEnglish':a['en'], 'category':'asterism', 'meaning':{'zh':a['zh']+'：以目录已有名称及英译为基础的现代教学意象。', 'en':a['en']+': a modern teaching motif based on the catalog name and pinned translation.'}, 'themeStatus':'modern-name-based-motif', 'basis':{'claimZh':'名称与英译来自固定版本星官目录；具体物象、画法与构图为现代设计，不是独有历史图像的证明。', 'claimEn':'Names and English meanings follow the pinned catalog; selected objects and composition are modern design, not evidence for a unique historical image.', 'evidenceIds':['fixed','hk'], 'perStarAnatomyClaimed':False, 'uniqueHistoricalImageClaimed':False}, 'caution':caution, 'interpretationCaution':caution, 'promptSubject':subjects[a['id']], 'axisPolicy':'north-up', 'axisGuidance':'Keep this authored subject pose upright in celestial north-up coordinates. An artist may instead supply an inspected axisUV plus an explicit member-pca policy when the subject has a meaningful long axis; never invent star/body correspondences.', 'minimumAngularDiameterDegrees':3, 'minimumAngularDiameterBasis':'modern-layout', 'primaryMemberCount':count, 'primaryMemberStatus':a['primaryMemberStatus']['state']})
    assert len(entries)==280 and len(originals)==39 and len(covered)==32
    assert set(subjects)=={x['targetIds'][0].split(':')[-1] for x in entries}
    brief={'schema':'starorbit-chinese-art-expansion-1', 'snapshotDate':'2026-11-08', 'catalogAsterisms':312, 'preservedArtworkIds':[x['imageId'] for x in originals], 'preservedIndividualAsterismCount':len(covered), 'newArtworkCount':len(entries), 'plannedArtworkCount':319, 'style':{'referenceFiles':['assets/chinese-sky/art/celestial-wolf.png'], 'description':'Preserve the existing celestial-wolf illustration language: delicate ivory and pale-gold engraved linework, restrained shading, elegant transparent isolated silhouette. No stars, constellation connectors, labels, writing, border, sky, opaque background or photographic realism. Each illustration is a modern teaching interpretation, never an authenticated ancient icon.'}, 'evidence':config.get('evidence',{}), 'entries':entries, 'memberAudit':{'asterisms':len(audit), 'withoutPrimaryMembers':sum(x['primaryMembers']==0 for x in audit), 'singlePrimaryMember':sum(x['primaryMembers']==1 for x in audit), 'newSinglePrimaryMember':sum(x['primaryMemberCount']==1 for x in entries), 'membershipStates':dict(Counter(x['membershipState'] for x in audit)), 'minimumExtentPolicy':'A 3 degree minimum visible-image angular diameter is explicitly modern-layout. It changes only illustration size and never creates stars, source membership or anatomical correspondences.', 'items':audit}}
    (OUT / 'expansion-brief.json').write_text(json.dumps(brief,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'entries':len(entries),'preserved':len(originals),'memberAudit':{k:v for k,v in brief['memberAudit'].items() if k!='items'}},ensure_ascii=False))
if __name__=='__main__':main()
