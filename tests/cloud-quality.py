"""Regression fixtures for conservative cloud image QA, not weather validation."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import numpy as np
from PIL import Image
from cloud_quality import inspect_image, quality_ok


def inspect(a):return inspect_image(Image.fromarray(a.astype('uint8')))

def reason(a,name):
    result=inspect(a)
    assert name in result['reasons'],result

# Clear/low-opacity uniform sky must not be mistaken for a white retrieval block.
assert quality_ok(inspect(np.full((512,1024),80)))
assert quality_ok(inspect(np.zeros((512,1024))))
# Structured bright clouds, even globally widespread, are not rejected for coverage.
y,x=np.mgrid[:512,:1024]
clouds=190+22*np.sin(x/17)+17*np.cos(y/11)+8*np.sin((x+y)/7)
assert quality_ok(inspect(clouds))
# Actual cache failure shape: large irregular patch, opacity 206 (tau approx32.4).
patch=(clouds-120).copy();region=((x-700)/150)**2+((y-60)/36)**2<1;patch[region]=206
reason(patch,'high-opacity-plateau')
# Small flat patches are ordinary quantization and must be accepted.
small=clouds.copy();small[40:48,80:88]=206
assert quality_ok(inspect(small))
# Global cloud amount changes are not the definition of a failed download.
assert quality_ok(inspect(clouds-120))
# Seam is strong, same direction, long, with smooth sides; no editing/reconstruction.
vertical=np.full((512,1024),40);vertical[:,500:]=140
reason(vertical,'internal-seam')
horizontal=np.full((512,1024),40);horizontal[250:,:]=140
reason(horizontal,'internal-seam')
# Wrap seam can occur without any internal discontinuity.
wrap=np.tile(np.linspace(30,150,1024),(512,1))
result=inspect(wrap);assert result['reasons']==['dateline-seam'],result
# A few localized edge pixels are not a persistent map-wide seam.
local=np.full((512,1024),40);local[200:212,-2:]=140
assert quality_ok(inspect(local))
assert not quality_ok({'schema':0,'status':'accepted','reasons':[]})
assert not quality_ok({'schema':1,'status':'accepted','reasons':['internal-seam']})
assert not quality_ok({'schema':1,'status':'accepted'})
print('Cloud image quality: plateau, structured clouds, internal/wrap seams and schema passed')

# Source packed valid_range is checked BEFORE scaling; clear sky remains valid
# without a cloud optical-depth retrieval, and unknown/fill phases stay invalid.
from satcorps import opacity
attrs={'_FillValue':65535,'valid_range':[1,15000],'scale_factor':.01,'add_offset':0}
depth=np.array([0,1,15000,15001,65534,65535],dtype=np.uint16)
alpha,valid=opacity(np.ones(6,dtype=np.uint8),depth,np.zeros(6,dtype=np.int16),attrs,1000,2000)
assert valid.tolist()==[False,True,True,False,False,False]
assert alpha[[0,3,4,5]].tolist()==[0,0,0,0]
assert 240<alpha[2]<255
phase=np.array([0,4,3,5,13,127],dtype=np.uint8)
alpha,valid=opacity(phase,np.full(6,65535,dtype=np.uint16),np.zeros(6,dtype=np.int16),attrs,1000,2000)
assert valid.tolist()==[True,True,False,False,False,False]
assert not alpha.any()
print('NASA packed optical-depth bounds and phase semantics passed')
