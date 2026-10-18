"""Draft lexical equivalences for two submitted-review History criteria."""


def revise_grade11(rubrics):
    concepts={c['id']:c for c in rubrics['concepts']}
    def point(pid,text,groups):return {'id':pid,'text':text,'groups':groups}
    concepts['hist-g11-l02-c01']['points']=[
        point('facet-1','Britain valued Sri Lanka for its position on Indian Ocean sea routes.',[
            ['britain','british'],['sri lanka','ceylon','island'],
            ['value','valued','valuable','important','importance','interest','interests'],
            ['position','location','located'],['indian ocean','sea routes','sea route','shipping routes','shipping lanes']]),
        point('facet-2','Trincomalee harbour was important for naval security around India.',[
            ['trincomalee'],['harbour','harbor','port'],['naval','navy'],
            ['security','defence','defense','strategic','strategically'],['india']])]
    concepts['hist-g11-l04-c01']['points']=[
        point('facet-1','The reforms of 1833 reorganized British colonial government and administration.',[
            ['1833'],['reforms','reform','colebrooke','cameron'],['british','colonial'],['government','administration'],
            ['reorganized','reorganised','reorganizing','reorganising','reorganisation','reorganization','restructured','restructuring','reformed']]),
        point('facet-2','Councils were established and administrative divisions reshaped.',[
            ['councils','council'],['establish','established','establishing','created','creating','set up'],
            ['administrative','administration'],['divisions','division','boundaries','provinces'],
            ['reshaped','reshaping','reorganized','reorganised','reorganisation','reorganization','revised','changed','changes','restructured']])]
    return rubrics
